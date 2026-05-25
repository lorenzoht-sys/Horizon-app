import { View, Text, Image, StyleSheet } from '@react-pdf/renderer';

export interface PdfPraticienSettings {
  prenom: string;
  nom: string;
  titre?: string;
  email: string;
  telephone: string;
  societe?: string;
  logoPraticien?: string;
}

const DARK = '#0D2B2B';
export const LOGO_H = '/logo-horizon.png.png';

const S = StyleSheet.create({
  header: {
    backgroundColor: DARK,
    paddingVertical: 12,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hLogoBox: { width: 60, height: 30 },
  hLogo: { width: '100%', height: '100%', objectFit: 'contain' },
  hCenter: { flex: 1, paddingHorizontal: 14, alignItems: 'center' },
  hTitle: { color: 'white', fontSize: 12, fontFamily: 'Helvetica-Bold' },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: DARK,
    paddingVertical: 8,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fLogoBox: { width: 44, height: 22 },
  fLogo: { width: '100%', height: '100%', objectFit: 'contain' },
  fContact: { color: 'white', fontSize: 8, textAlign: 'center' },
  fPage: { color: 'white', fontSize: 9, minWidth: 28, textAlign: 'right' },
});

export function PdfHeader({ settings, title }: { settings: PdfPraticienSettings; title: string }) {
  const rightLogo = settings.logoPraticien || LOGO_H;
  return (
    <View style={S.header}>
      <View style={S.hLogoBox}><Image src={LOGO_H} style={S.hLogo} /></View>
      <View style={S.hCenter}>
        <Text style={S.hTitle}>{title}</Text>
      </View>
      <View style={S.hLogoBox}><Image src={rightLogo} style={S.hLogo} /></View>
    </View>
  );
}

export function PdfFooter({ settings }: { settings: PdfPraticienSettings }) {
  return (
    <View style={S.footer} fixed>
      <View style={S.fLogoBox}><Image src={LOGO_H} style={S.fLogo} /></View>
      <Text style={S.fContact}>{settings.telephone}  ·  {settings.email}</Text>
      <Text style={S.fPage} render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
    </View>
  );
}
