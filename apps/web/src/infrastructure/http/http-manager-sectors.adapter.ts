import { z } from "zod";
import type { AccessibleSector, ManagerSectorsPort } from "@/ports/manager-sectors.port";
import { AccessibleSectorSchema } from "@/ports/manager-sectors.port";
import { API_BASE_URL } from './api-base-url';


export class HttpManagerSectorsAdapter implements ManagerSectorsPort {
  async listAccessible(token: string): Promise<AccessibleSector[]> {
    const response = await fetch(`${API_BASE_URL}/manager/sectors`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`list accessible sectors failed with status ${response.status}`);
    return z.array(AccessibleSectorSchema).parse(await response.json());
  }
}
