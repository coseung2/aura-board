import { NativeModule, requireOptionalNativeModule } from "expo";

import type {
  HealthConnectDailyStats,
  HealthConnectPermission,
  HealthConnectStatus,
  LiveStepUpdate,
  LiveStepUpdateStatus,
} from "./AuraBoardHealthConnect.types";

declare class AuraBoardHealthConnectNativeModule extends NativeModule {
  getStatus(): Promise<HealthConnectStatus>;
  getGrantedPermissions(): Promise<HealthConnectPermission[]>;
  requestPermissions(): Promise<HealthConnectPermission[]>;
  readDailyStats(startDay: string, endDay: string): Promise<HealthConnectDailyStats[]>;
  openSettings(): Promise<void>;
  startLiveStepUpdates(): Promise<LiveStepUpdateStatus>;
  stopLiveStepUpdates(): void;
  addListener(
    eventName: "onLiveStepUpdate",
    listener: (event: LiveStepUpdate) => void,
  ): { remove(): void };
}

export default requireOptionalNativeModule<AuraBoardHealthConnectNativeModule>(
  "AuraBoardHealthConnect",
);
