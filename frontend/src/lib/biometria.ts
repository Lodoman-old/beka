import { Capacitor } from '@capacitor/core';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';

const SERVIDOR_SEGURO = 'beka';

export async function guardarCredencialesBiometricas(
  usuario: string,
  password: string
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await NativeBiometric.setCredentials({
      username: usuario,
      password,
      server: SERVIDOR_SEGURO,
    });
  } catch {
    // sin biometria disponible en el dispositivo
  }
}

export async function entrarConBiometria(): Promise<{ usuario: string; password: string } | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    await NativeBiometric.verifyIdentity({
      title: 'Entrar a BEKA',
      subtitle: 'Confirma con tu huella',
      description: 'Coloca tu dedo para desbloquear la aplicación',
      negativeButtonText: 'Cancelar',
      maxAttempts: 3,
    });
  } catch {
    return null;
  }
  try {
    const credenciales = await NativeBiometric.getCredentials({ server: SERVIDOR_SEGURO });
    if (!credenciales.username || !credenciales.password) return null;
    return { usuario: credenciales.username, password: credenciales.password };
  } catch {
    return null;
  }
}

export async function biometriaDisponible(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const resultado = await NativeBiometric.isAvailable();
    return resultado.isAvailable;
  } catch {
    return false;
  }
}