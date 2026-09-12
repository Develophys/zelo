export async function checkHasCamera(): Promise<boolean> {
  const { default: QrScanner } = await import('qr-scanner');
  return QrScanner.hasCamera().catch(() => false);
}
