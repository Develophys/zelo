export interface PeerPartnerRow {
  id: string;
  name: string;
  passwordHash: string;
  institutionId: string;
  specialty: string;
  isActive: boolean;
}

export interface PeerPartnerSummaryRow {
  id: string;
  name: string;
  specialty: string;
  isActive: boolean;
}

export interface CreatePeerPartnerParams {
  name: string;
  passwordHash: string;
  institutionId: string;
  specialty: string;
}

export interface UpdatePeerPartnerParams {
  isActive?: boolean;
  specialty?: string;
  passwordHash?: string;
}

export interface PeerPartnerRepository {
  findByName(name: string): Promise<PeerPartnerRow | null>;
  findById(id: string): Promise<PeerPartnerRow | null>;
  findAllByInstitution(institutionId: string): Promise<PeerPartnerSummaryRow[]>;
  create(params: CreatePeerPartnerParams): Promise<{ id: string; name: string }>;
  update(id: string, patch: UpdatePeerPartnerParams): Promise<void>;
}

export const PEER_PARTNER_REPOSITORY = Symbol("PEER_PARTNER_REPOSITORY");
