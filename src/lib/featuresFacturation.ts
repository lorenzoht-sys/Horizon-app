// Interrupteur de l'ancienne ébauche de facturation (table `factures_suivi`).
//
// 2026-10-05 — MASQUÉE de l'interface. Cette ébauche (section « Factures à envoyer » de la page
// Stats, bloc « Facturation » de la fiche structure) n'est pas une facturation conforme : pas de
// numérotation, pas de lignes de facture ni de lien vers les séances facturées, aucune mention
// légale (SIRET, adresse, TVA), PDF généré dans le navigateur. Elle ne doit plus servir à de
// vraies factures (voir docs/FACTURATION.md et AUDIT_FACTURATION.md).
//
// Mise à l'abri, pas suppression : le code, le hook `useFactures` et la table restent intacts. Le
// masquage coupe aussi la génération AUTOMATIQUE, qui écrivait dans `factures_suivi` à chaque
// ouverture de la page Stats (SectionFactures n'est plus monté, donc son effet ne s'exécute plus).
//
// À ne repasser à `true` que pour remplacer l'ébauche par le vrai module de facturation, jamais
// pour la réactiver telle quelle. `featuresFacturation.test.ts` fait échouer la CI si ce
// interrupteur change ou si un point d'entrée n'est plus protégé par lui.
export const EBAUCHE_FACTURATION_VISIBLE = false;
