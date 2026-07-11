import { NativeModule, requireOptionalNativeModule } from "expo";

import type {
  HealthConnectDailyStats,
  HealthConnectPermission,
  HealthConnectStatus,
} from "./AuraBoardHealthConnect.types";

declare class AuraBoardHealthConnectNativeModule extends NativeModule {
  getStatus(): Promise<HealthConnectStatus>;
  getGrantedPermissions(): Promise<HealthConnectPermission[]>;
  requestPermissions(): Promise<HealthConnectPermission[]>;
  readDailyStats(startDay: string, endDay: string): Promise<HealthConnectDailyStats[]>;
  openSettings(): Promise<void>;
}

export default requireOptionalNativeModule<AuraBoardHealthConnectNativeModule>(
  "AuraBoardHealthConnect",
);
