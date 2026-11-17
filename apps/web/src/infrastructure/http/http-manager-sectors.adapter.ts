import { z } from "zod";
import type { AccessibleSector, ManagerSectorsPort } from "@/ports/manager-sectors.port";
import { AccessibleSectorSchema } from "@/ports/manager-sectors.port";
import { apiFetch } from "./api-fetch";


export class HttpManagerSectorsAdapter implements ManagerSectorsPort {
  async listAccessible(): Promise<AccessibleSector[]> {
    const response = await apiFetch("/manager/sectors");
    if (!response.ok) throw new Error(`list accessible sectors failed with status ${response.status}`);
    return z.array(AccessibleSectorSchema).parse(await response.json());
  }
}
