import type { ManagerRole } from "../modules/manager/application/ports/manager-repository.port.ts";

declare global {
  namespace Express {
    interface Request {
      admin?: { id: string; name: string };
      manager?: { id: string; name: string; institutionId: string; role: ManagerRole };
      peerPartner?: { id: string; name: string; institutionId: string };
    }
  }
}
