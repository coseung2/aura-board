import ExpoModulesCore
import CoreMotion
import HealthKit
import UIKit

private let seoulTimeZone = TimeZone(identifier: "Asia/Seoul")!
private let maximumReadDays = 31

public final class AuraBoardHealthConnectModule: Module {
  private let healthStore = HKHealthStore()
  private let stepType = HKQuantityType.quantityType(forIdentifier: .stepCount)!
  private let pedometer = CMPedometer()
  private let liveStepLock = NSLock()
  private var liveStepUpdatesActive = false
  private var liveStepBaseline: Int?
  private var liveStepSessionID = 0

  public func definition() -> ModuleDefinition {
    Name("AuraBoardHealthConnect")
    Events("onLiveStepUpdate")

    OnDestroy {
      self.stopLiveStepUpdates()
    }

    AsyncFunction("getStatus") { () -> String in
      HKHealthStore.isHealthDataAvailable() ? "available" : "unavailable"
    }

    AsyncFunction("getGrantedPermissions") { (promise: Promise) in
      guard HKHealthStore.isHealthDataAvailable() else {
        promise.resolve([])
        return
      }

      self.healthStore.getRequestStatusForAuthorization(
        toShare: [],
        read: self.requiredTypes
      ) { status, error in
        if let error {
          promise.reject("HEALTH_CONNECT_PROVIDER_ERROR", error.localizedDescription)
          return
        }

        // HealthKit deliberately does not disclose individual read grants.
        // `unnecessary` means the authorization request was already handled.
        promise.resolve(status == .shouldRequest ? [] : ["steps"])
      }
    }

    AsyncFunction("requestPermissions") { (promise: Promise) in
      guard HKHealthStore.isHealthDataAvailable() else {
        promise.reject(
          "HEALTH_CONNECT_PROVIDER_UNAVAILABLE",
          "Apple 건강 데이터를 이 기기에서 사용할 수 없습니다."
        )
        return
      }

      self.healthStore.requestAuthorization(toShare: [], read: self.requiredTypes) { success, error in
        if let error {
          promise.reject("HEALTH_CONNECT_PERMISSION_REQUIRED", error.localizedDescription)
          return
        }
        promise.resolve(success ? ["steps"] : [])
      }
    }.runOnQueue(.main)

    AsyncFunction("readDailyStats") { (startDay: String, endDay: String, promise: Promise) in
      Task {
        do {
          let rows = try await self.readDailyStats(startDay: startDay, endDay: endDay)
          promise.resolve(rows)
        } catch {
          promise.reject("HEALTH_CONNECT_PROVIDER_ERROR", error.localizedDescription)
        }
      }
    }

    AsyncFunction("startLiveStepUpdates") { () -> String in
      self.startLiveStepUpdates()
    }

    Function("stopLiveStepUpdates") {
      self.stopLiveStepUpdates()
    }

    AsyncFunction("openSettings") { (promise: Promise) in
      DispatchQueue.main.async {
        guard let url = URL(string: UIApplication.openSettingsURLString) else {
          promise.reject("HEALTH_CONNECT_PROVIDER_ERROR", "iPhone 설정을 열 수 없습니다.")
          return
        }
        UIApplication.shared.open(url, options: [:]) { opened in
          if opened {
            promise.resolve(nil)
          } else {
            promise.reject("HEALTH_CONNECT_PROVIDER_ERROR", "iPhone 설정을 열 수 없습니다.")
          }
        }
      }
    }.runOnQueue(.main)
  }

  private var requiredTypes: Set<HKObjectType> {
    [stepType]
  }

  private func startLiveStepUpdates() -> String {
    guard CMPedometer.isStepCountingAvailable() else {
      return "unavailable"
    }

    switch CMPedometer.authorizationStatus() {
    case .denied, .restricted:
      return "permission_required"
    case .authorized, .notDetermined:
      break
    @unknown default:
      return "unavailable"
    }

    liveStepLock.lock()
    if liveStepUpdatesActive {
      liveStepLock.unlock()
      return "started"
    }

    liveStepSessionID &+= 1
    let sessionID = liveStepSessionID
    liveStepUpdatesActive = true
    liveStepBaseline = 0
    liveStepLock.unlock()

    pedometer.startUpdates(from: Date()) { [weak self] data, error in
      guard let self else { return }

      if error != nil {
        self.stopLiveStepUpdates(sessionID: sessionID)
        return
      }

      guard let data else { return }
      let cumulativeSteps = max(0, data.numberOfSteps.intValue)

      self.liveStepLock.lock()
      guard self.liveStepUpdatesActive, self.liveStepSessionID == sessionID else {
        self.liveStepLock.unlock()
        return
      }

      let baseline = self.liveStepBaseline ?? cumulativeSteps
      let delta = cumulativeSteps - baseline
      if delta > 0 {
        self.liveStepBaseline = cumulativeSteps
        self.sendEvent("onLiveStepUpdate", ["delta": delta])
      }
      self.liveStepLock.unlock()
    }

    return "started"
  }

  private func stopLiveStepUpdates() {
    stopLiveStepUpdates(sessionID: nil)
  }

  private func stopLiveStepUpdates(sessionID: Int?) {
    liveStepLock.lock()
    if let sessionID, liveStepSessionID != sessionID {
      liveStepLock.unlock()
      return
    }

    liveStepUpdatesActive = false
    liveStepBaseline = nil
    liveStepSessionID &+= 1
    liveStepLock.unlock()
    pedometer.stopUpdates()
  }

  private func readDailyStats(startDay: String, endDay: String) async throws -> [[String: Any]] {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = seoulTimeZone
    formatter.dateFormat = "yyyy-MM-dd"

    guard let startDate = formatter.date(from: startDay),
          let endDate = formatter.date(from: endDay) else {
      throw WalkingHealthModuleError.invalidDate
    }

    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = seoulTimeZone
    let start = calendar.startOfDay(for: startDate)
    let end = calendar.startOfDay(for: endDate)
    let dayCount = calendar.dateComponents([.day], from: start, to: end).day ?? -1
    guard dayCount >= 0, dayCount < maximumReadDays else {
      throw WalkingHealthModuleError.invalidDateRange
    }

    return try await Array(0...dayCount).asyncMap { offset in
      guard let dayStart = calendar.date(byAdding: .day, value: offset, to: start),
            let dayEnd = calendar.date(byAdding: .day, value: 1, to: dayStart) else {
        throw WalkingHealthModuleError.invalidDateRange
      }
      return [
        "day": formatter.string(from: dayStart),
        "steps": try await self.quantitySum(for: self.stepType, unit: .count(), start: dayStart, end: dayEnd),
        "distanceMeters": 0.0
      ]
    }
  }

  private func quantitySum(
    for type: HKQuantityType,
    unit: HKUnit,
    start: Date,
    end: Date
  ) async throws -> Double {
    try await withCheckedThrowingContinuation { continuation in
      let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
      let query = HKStatisticsQuery(
        quantityType: type,
        quantitySamplePredicate: predicate,
        options: .cumulativeSum
      ) { _, result, error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        continuation.resume(returning: result?.sumQuantity()?.doubleValue(for: unit) ?? 0)
      }
      healthStore.execute(query)
    }
  }
}

private enum WalkingHealthModuleError: LocalizedError {
  case invalidDate
  case invalidDateRange

  var errorDescription: String? {
    switch self {
    case .invalidDate:
      return "날짜 형식이 올바르지 않습니다."
    case .invalidDateRange:
      return "한 번에 최근 31일까지만 읽을 수 있습니다."
    }
  }
}

private extension Array {
  func asyncMap<T>(_ transform: (Element) async throws -> T) async rethrows -> [T] {
    var results: [T] = []
    results.reserveCapacity(count)
    for element in self {
      results.append(try await transform(element))
    }
    return results
  }
}
