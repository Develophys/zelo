export interface PeerPartnerRow {
  id: string;
  name: string;
  email: string;
  passwordHash: string | null;
  setPasswordTokenExpiresAt: Date | null;
  institutionId: string;
  specialty: string;
  isActive: boolean;
}

export interface PeerPartnerSummaryRow {
  id: string;
  name: string;
  email: string;
  specialty: string;
  isActive: boolean;
  hasPassword: boolean;
  setPasswordTokenExpiresAt: string | null;
}

export interface CreatePeerPartnerParams {
  name: string;
  email: string;
  institutionId: string;
  specialty: string;
  setPasswordToken: string;
  setPasswordTokenExpiresAt: Date;
}

export interface UpdatePeerPartnerParams {
  isActive?: boolean;
  specialty?: string;
  passwordHash?: string | null;
  setPasswordToken?: string | null;
  setPasswordTokenExpiresAt?: Date | null;
}

export interface PeerPartnerRepository {
  findByEmail(email: string): Promise<PeerPartnerRow | null>;
  findBySetPasswordToken(token: string): Promise<PeerPartnerRow | null>;
  findById(id: string): Promise<PeerPartnerRow | null>;
  findAllByInstitution(institutionId: string): Promise<PeerPartnerSummaryRow[]>;
  create(params: CreatePeerPartnerParams): Promise<{ id: string; name: string; email: string }>;
  update(id: string, patch: UpdatePeerPartnerParams): Promise<void>;
  findLapsedInvites(
    now: Date,
  ): Promise<{ id: string; name: string; institutionId: string; setPasswordTokenExpiresAt: Date }[]>;
  delete(id: string): Promise<void>;
}

export const PEER_PARTNER_REPOSITORY = Symbol("PEER_PARTNER_REPOSITORY");
