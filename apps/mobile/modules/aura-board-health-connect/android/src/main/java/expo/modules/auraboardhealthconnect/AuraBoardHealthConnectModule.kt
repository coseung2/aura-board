package expo.modules.auraboardhealthconnect

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.time.TimeRangeFilter
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import java.util.ArrayList

private const val HEALTH_CONNECT_PACKAGE = "com.google.android.apps.healthdata"
private const val MAX_READ_DAYS = 31L

private class HealthConnectPermissionsContract :
  AppContextActivityResultContract<ArrayList<String>, Set<String>> {
  private val delegate = PermissionController.createRequestPermissionResultContract()

  override fun createIntent(context: Context, input: ArrayList<String>): Intent =
    delegate.createIntent(context, input.toSet())

  override fun parseResult(input: ArrayList<String>, resultCode: Int, intent: Intent?): Set<String> =
    delegate.parseResult(resultCode, intent)
}

class AuraBoardHealthConnectModule : Module() {
  private val requiredPermissions = setOf(
    HealthPermission.getReadPermission(StepsRecord::class),
    HealthPermission.getReadPermission(DistanceRecord::class)
  )

  private lateinit var permissionsLauncher:
    AppContextActivityResultLauncher<ArrayList<String>, Set<String>>

  override fun definition() = ModuleDefinition {
    Name("AuraBoardHealthConnect")

    RegisterActivityContracts {
      permissionsLauncher = registerForActivityResult(HealthConnectPermissionsContract())
    }

    AsyncFunction("getStatus") {
      statusLabel(reactContext())
    }

    AsyncFunction("getGrantedPermissions").SuspendBody<List<String>> {
      val client = requireAvailableClient()
      permissionLabels(client.permissionController.getGrantedPermissions())
    }

    AsyncFunction("requestPermissions").SuspendBody<List<String>> {
      requireAvailableClient()
      val granted = permissionsLauncher.launch(ArrayList(requiredPermissions))
      permissionLabels(granted)
    }

    AsyncFunction("readDailyStats").SuspendBody { startDay: String, endDay: String ->
      readDailyStats(startDay, endDay)
    }

    AsyncFunction("openSettings") {
      openHealthConnectSettings()
    }
  }

  private fun reactContext(): Context =
    requireNotNull(appContext.reactContext) { "Android 컨텍스트를 사용할 수 없습니다." }

  private fun statusLabel(context: Context): String =
    when (HealthConnectClient.getSdkStatus(context)) {
      HealthConnectClient.SDK_AVAILABLE -> "available"
      HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "needs_update"
      else -> "unavailable"
    }

  private fun requireAvailableClient(): HealthConnectClient {
    val context = reactContext()
    check(HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE) {
      "Health Connect를 사용할 수 없거나 업데이트가 필요합니다."
    }
    return HealthConnectClient.getOrCreate(context)
  }

  private fun permissionLabels(granted: Set<String>): List<String> = buildList {
    if (granted.contains(HealthPermission.getReadPermission(StepsRecord::class))) {
      add("steps")
    }
    if (granted.contains(HealthPermission.getReadPermission(DistanceRecord::class))) {
      add("distance")
    }
  }

  private suspend fun readDailyStats(
    startDayValue: String,
    endDayValue: String
  ): List<Map<String, Any>> {
    val startDay = LocalDate.parse(startDayValue)
    val endDay = LocalDate.parse(endDayValue)
    require(!endDay.isBefore(startDay)) { "종료일은 시작일보다 빠를 수 없습니다." }

    val inclusiveDays = ChronoUnit.DAYS.between(startDay, endDay) + 1
    require(inclusiveDays in 1L..MAX_READ_DAYS) { "한 번에 최대 31일까지만 읽을 수 있습니다." }

    val client = requireAvailableClient()
    val granted = client.permissionController.getGrantedPermissions()
    check(granted.containsAll(requiredPermissions)) {
      "걸음 수와 거리 읽기 권한이 필요합니다."
    }

    val zoneId = ZoneId.systemDefault()
    return (0L until inclusiveDays).map { offset ->
      val day = startDay.plusDays(offset)
      val startInstant = day.atStartOfDay(zoneId).toInstant()
      val endInstant = day.plusDays(1).atStartOfDay(zoneId).toInstant()
      val result = client.aggregate(
        AggregateRequest(
          metrics = setOf(StepsRecord.COUNT_TOTAL, DistanceRecord.DISTANCE_TOTAL),
          timeRangeFilter = TimeRangeFilter.between(startInstant, endInstant)
        )
      )

      mapOf<String, Any>(
        "day" to day.toString(),
        "steps" to (result[StepsRecord.COUNT_TOTAL] ?: 0L),
        "distanceMeters" to (result[DistanceRecord.DISTANCE_TOTAL]?.inMeters ?: 0.0)
      )
    }
  }

  private fun openHealthConnectSettings() {
    val context = reactContext()
    val status = HealthConnectClient.getSdkStatus(context)

    val intent = when (status) {
      HealthConnectClient.SDK_AVAILABLE ->
        Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS)
      HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED ->
        Intent(Intent.ACTION_VIEW).apply {
          setPackage("com.android.vending")
          data = Uri.parse(
            "market://details?id=$HEALTH_CONNECT_PACKAGE&url=healthconnect%3A%2F%2Fonboarding"
          )
          putExtra("overlay", true)
          putExtra("callerId", context.packageName)
        }
      else -> throw IllegalStateException("이 기기에서는 Health Connect를 사용할 수 없습니다.")
    }.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

    try {
      context.startActivity(intent)
    } catch (_: ActivityNotFoundException) {
      context.startActivity(
        Intent(
          Intent.ACTION_VIEW,
          Uri.parse("https://play.google.com/store/apps/details?id=$HEALTH_CONNECT_PACKAGE")
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      )
    }
  }
}
