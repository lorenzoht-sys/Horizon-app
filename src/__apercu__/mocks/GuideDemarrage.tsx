export function GuideDemarrage({ replie, mobile }: { replie?: boolean; mobile?: boolean }) {
  if (!replie && !mobile) return null;
  return <div style={{ background: '#fff', border: '1px solid #E2EEEE', borderRadius: 14, padding: '10px 16px', fontSize: 13 }}><strong>Prise en main : 5 sur 7.</strong> Prochaine étape : votre profil de facturation. <a href="#">Continuer</a></div>;
}
