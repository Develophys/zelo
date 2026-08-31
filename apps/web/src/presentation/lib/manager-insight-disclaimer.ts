/**
 * Stated once so the screen and both exports cannot drift apart.
 *
 * The doctor-facing chat carries a permanent, non-dismissable AI banner
 * (`ChatDisclaimerBanner`). The manager-facing interpretation had none — and it
 * is the output that leaves the app as a .txt or a PDF and gets quoted to
 * leadership, where nothing around it says how it was produced.
 *
 * Non-diagnostic and provenance-first, matching the register of the NR-1 card
 * that already refuses to claim certification.
 */
export const MANAGER_INSIGHT_DISCLAIMER =
  'Gerada por IA a partir de indicadores agregados e anônimos, sem acesso a dados individuais. ' +
  'É um apoio à leitura dos números — não um laudo, nem uma recomendação clínica.';
