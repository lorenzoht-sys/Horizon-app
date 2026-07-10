import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Rendu markdown partagé — utilisé par "Mon assistant" (AssistantPage.tsx)
// et par l'espace bénéficiaire (EspacePatient.tsx) pour afficher les
// documents générés par l'IA (comptes-rendus, etc.) de façon identique,
// plutôt que de dupliquer ce composant/style à chaque endroit.
const MD_COMPONENTS = {
  h1: ({children}: any) => <h1 style={{fontSize:'18px', fontWeight:'600', color:'#111827', marginBottom:'12px', marginTop:'16px'}}>{children}</h1>,
  h2: ({children}: any) => <h2 style={{fontSize:'15px', fontWeight:'600', color:'#111827', marginBottom:'8px', marginTop:'14px'}}>{children}</h2>,
  h3: ({children}: any) => <h3 style={{fontSize:'14px', fontWeight:'500', color:'var(--color-teal)', marginBottom:'6px', marginTop:'12px'}}>{children}</h3>,
  p: ({children}: any) => <p style={{fontSize:'14px', lineHeight:'1.7', color:'#374151', marginBottom:'8px'}}>{children}</p>,
  strong: ({children}: any) => <strong style={{fontWeight:'600', color:'#111827'}}>{children}</strong>,
  ul: ({children}: any) => <ul style={{paddingLeft:'18px', marginBottom:'8px'}}>{children}</ul>,
  li: ({children}: any) => <li style={{fontSize:'14px', lineHeight:'1.7', color:'#374151', marginBottom:'4px'}}>{children}</li>,
  hr: () => <hr style={{border:'none', borderTop:'0.5px solid #E5E7EB', margin:'12px 0'}} />,
  table: ({children}: any) => (
    <div style={{overflowX:'auto', marginBottom:'16px', marginTop:'8px'}}>
      <table style={{width:'100%', borderCollapse:'collapse', fontSize:'13px', border:'0.5px solid #E5E7EB', borderRadius:'8px', overflow:'hidden'}}>{children}</table>
    </div>
  ),
  thead: ({children}: any) => <thead style={{background:'#F9FAFB'}}>{children}</thead>,
  tbody: ({children}: any) => <tbody>{children}</tbody>,
  tr: ({children}: any) => <tr style={{borderBottom:'0.5px solid #E5E7EB'}}>{children}</tr>,
  th: ({children}: any) => <th style={{padding:'8px 12px', fontWeight:'500', color:'#6B7280', textAlign:'left', fontSize:'12px', letterSpacing:'0.03em'}}>{children}</th>,
  td: ({children}: any) => <td style={{padding:'8px 12px', color:'#374151', fontSize:'13px', verticalAlign:'top'}}>{children}</td>,
};

interface Props {
  children: string;
}

export default function MarkdownRendu({ children }: Props) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
      {children}
    </ReactMarkdown>
  );
}
