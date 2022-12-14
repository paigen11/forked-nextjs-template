/* eslint-disable class-methods-use-this */
import { DataProvider } from "./DataProvider";
import { AttributeStore } from "./AttributeStore";
import { AppEvent, AppEventHandler } from "./AppEvent";
import {
  Project,
  Device,
  ProjectID,
  BulkDataImportStatus,
  Event,
} from "./AppModel";
import { IDBuilder } from "./IDBuilder";
import { NotificationsStore, Notification } from "./NotificationsStore";
import { serverLogError } from "../pages/api/log";
import { AppNotification } from "../components/presentation/notifications";
import { ALARM, NOTIFICATION } from "./NotificationEventHandler";

// this class / interface combo passes data and functions to the service locator file
interface AppServiceInterface {
  getEventCount: () => Promise<number>;
  getProject: () => Promise<Project>;
  getDevices: () => Promise<Device[]>;
  getDevice: (deviceUID: string) => Promise<Device | null>;
  setDeviceName: (deviceUID: string, name: string) => Promise<void>;

  handleEvent(event: AppEvent): Promise<void>;

  getDeviceEvents: (deviceUIDs: string[]) => Promise<Event[]>;
  getFleetsByProject: () => Promise<any>;
  getFleetsByDevice: (deviceUID: string) => Promise<any>;
  getDevicesByFleet: (fleetUID: string) => Promise<any>;
  getDeviceEnvVars: (deviceUID: string) => Promise<any>;
  getFleetEnvVars: (fleetUID: string) => Promise<any>;

  performBulkDataImport(): Promise<BulkDataImportStatus>;

  getAppNotifications(): Promise<AppNotification[]>;
}

export type { AppServiceInterface };

export default class AppService implements AppServiceInterface {
  private projectID: ProjectID;

  constructor(
    projectUID: string,
    private readonly idBuilder: IDBuilder,
    private dataProvider: DataProvider,
    private appEventHandler: AppEventHandler,
    private attributeStore: AttributeStore,
    private notificationStore: NotificationsStore
  ) {
    this.projectID = this.idBuilder.buildProjectID(projectUID);
  }

  async getEventCount(): Promise<number> {
    return 0;
  }

  async getProject(): Promise<Project> {
    const project = await this.dataProvider.getProject();
    return {
      devices: null,
      ...project,
    };
  }

  async setDeviceName(deviceUID: string, name: string): Promise<void> {
    return this.attributeStore.updateDeviceName(
      this.idBuilder.buildDeviceID(deviceUID),
      name
    );
  }

  async getDevices() {
    return this.dataProvider.getDevices();
  }

  async getDevice(deviceUID: string) {
    return this.dataProvider.getDevice(this.idBuilder.buildDeviceID(deviceUID));
  }

  async getDeviceEvents(deviceUIDs: string[]) {
    return this.dataProvider.getDeviceEvents(deviceUIDs);
  }

  async getFleetsByProject() {
    return this.dataProvider.getFleetsByProject();
  }

  async getFleetsByDevice(deviceUID: string) {
    return this.dataProvider.getFleetsByDevice(deviceUID);
  }

  async getDevicesByFleet(fleetUID: string) {
    return this.dataProvider.getDevicesByFleet(fleetUID);
  }

  async getDeviceEnvVars(deviceUID: string) {
    return this.dataProvider.getDeviceEnvVars(deviceUID);
  }

  async getFleetEnvVars(fleetUID: string) {
    return this.dataProvider.getFleetEnvVars(fleetUID);
  }

  async handleEvent(event: AppEvent) {
    return this.appEventHandler.handleEvent(event);
  }

  private currentProjectID() {
    return this.projectID;
  }

  async performBulkDataImport(): Promise<BulkDataImportStatus> {
    const startTime = performance.now();
    try {
      const b = await this.dataProvider.doBulkImport();
      const finishTime = performance.now();
      return {
        elapsedTimeMs: finishTime - startTime,
        erroredItemCount: b.errorCount,
        importedItemCount: b.itemCount,
        state: "done",
      };
    } catch (cause) {
      const finishTime = performance.now();
      return {
        elapsedTimeMs: finishTime - startTime,
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        err: `Please Try Again. Cause: ${cause}`,
        erroredItemCount: 0,
        importedItemCount: 0,
        state: "failed",
      };
    }
  }

  async getAppNotifications(): Promise<AppNotification[]> {
    const notifications: Notification[] =
      await this.notificationStore.getNotifications();
    const result = (
      await Promise.all(notifications.map(async (n) => this.appNotification(n)))
    ).filter((e): e is AppNotification => e !== null);
    return result;
  }

  private async appNotification(
    notification: Notification
  ): Promise<AppNotification | null> {
    switch (true) {
      case notification.type === ALARM:
        return this.buildDeviceAlarmModel(notification);
      case notification.type === NOTIFICATION:
        return null;
    }
    serverLogError(`unknown notification ${notification}`);
    return null;
  }

  async buildDeviceAlarmModel(
    notification: Notification
  ): Promise<AppNotification | null> {
    const result = {
      id: notification.id,
      type: ALARM,
      when: notification.when.getTime(),
      deviceId: notification.content.deviceID,
    };
    return result;
  }
}
