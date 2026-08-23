import { ListManagerNotificationsUseCase } from "@/use-cases/list-manager-notifications.usecase";
import { MarkManagerNotificationReadUseCase } from "@/use-cases/mark-manager-notification-read.usecase";
import { HttpManagerNotificationsAdapter } from "@/infrastructure/http/http-manager-notifications.adapter";

const port = new HttpManagerNotificationsAdapter();

export const listManagerNotificationsUseCase = new ListManagerNotificationsUseCase(port);
export const markManagerNotificationReadUseCase = new MarkManagerNotificationReadUseCase(port);
