import { NativeModule, requireOptionalNativeModule } from "expo";

import type {
  HealthConnectDailyStats,
  HealthConnectPermission,
  HealthConnectStatus,
  LiveStepUpdate,
  LiveStepUpdateStatus,
  MotionPermissionStatus,
} from "./AuraBoardHealthConnect.types";

declare class AuraBoardHealthConnectNativeModule extends NativeModule {
  getStatus(): Promise<HealthConnectStatus>;
  getGrantedPermissions(): Promise<HealthConnectPermission[]>;
  requestPermissions(): Promise<HealthConnectPermission[]>;
  readDailyStats(startDay: string, endDay: string): Promise<HealthConnectDailyStats[]>;
  openSettings(): Promise<void>;
  startLiveStepUpdates(): Promise<LiveStepUpdateStatus>;
  stopLiveStepUpdates(): void;
  getMotionPermissionStatus?: () => Promise<MotionPermissionStatus>;
  requestMotionPermission?: () => Promise<MotionPermissionStatus>;
  addListener(
    eventName: "onLiveStepUpdate",
    listener: (event: LiveStepUpdate) => void,
  ): { remove(): void };
}

export default requireOptionalNativeModule<AuraBoardHealthConnectNativeModule>(
  "AuraBoardHealthConnect",
);
