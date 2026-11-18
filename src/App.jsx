import { useState } from 'react';

const agents = [
  { name: 'ChatGPT', role: 'Architecture & orchestration', initials: 'G', tone: 'cyan', status: 'Coordinateur' },
  { name: 'Gemini', role: 'Research & counter-analysis', initials: 'Ge', tone: 'blue', status: 'En attente' },
  { name: 'Claude', role: 'Engineering & code review', initials: 'Cl', tone: 'violet', status: 'En attente' },
];

const initialMissions = [
  { id: 'NX-001', title: 'Définir les fondations produit', owner: 'ChatGPT', status: 'Vérifié', progress: 100 },
  { id: 'NX-002', title: 'Concevoir l’architecture technique', owner: 'À décider', status: 'À examiner', progress: 25 },
  { id: 'NX-003', title: 'Construire le tableau de bord', owner: 'ChatGPT', status: 'À faire', progress: 0 },
];

function Icon({ name }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 16 9 5 9-5"/></>,
    activity: <><path d="M3 12h4l3-8 4 16 3-8h4"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.7 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.7-1l-1.7.6-1.4-2.4 1.4-1.1a7 7 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.7-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.7 1l1.7-.6 1.4 2.4-1.4 1.1a7 7 0 0 1 0 2Z"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function App() {
  const [active, setActive] = useState('Vue générale');
  const [missions, setMissions] = useState(initialMissions);
  const [showNewMission, setShowNewMission] = useState(false);
  const [missionTitle, setMissionTitle] = useState('');
  const nav = [
    { label: 'Vue générale', icon: 'grid' },
    { label: 'Missions', icon: 'layers' },
    { label: 'Activité', icon: 'activity' },
    { label: 'Paramètres', icon: 'settings' },
  ];
  const addMission = (event) => {
    event.preventDefault();
    const title = missionTitle.trim();
    if (!title) return;
    setMissions((items) => [...items, {
      id: `NX-${String(items.length + 1).padStart(3, '0')}`,
      title,
      owner: 'À attribuer',
      status: 'À faire',
      progress: 0,
    }]);
    setMissionTitle('');
    setShowNewMission(false);
    setActive('Missions');
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={() => setActive('Vue générale')}>
          <span className="brand-mark"><span /></span>
          <span><strong>NEXUS<span>³</span></strong><small>AI PROJECT COMMAND</small></span>
        </a>
        <div className="workspace-label">ESPACE DE TRAVAIL</div>
        <nav className="main-nav" aria-label="Navigation principale">
          {nav.map((item) => (
            <button key={item.label} className={active === item.label ? 'nav-item active' : 'nav-item'} onClick={() => setActive(item.label)}>
              <Icon name={item.icon} /><span>{item.label}</span>
              {item.label === 'Missions' && <em>{missions.length}</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="connection"><span className="pulse-dot" /><span>Workspace local</span><small>Prototype</small></div>
          <div className="profile"><div className="avatar">F</div><div><strong>Fondateur</strong><small>Administrateur</small></div><span className="profile-dots">···</span></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">Workspace <span>/</span> <strong>{active}</strong></div>
          <div className="top-actions"><span className="system-status"><i /> Système initialisé</span><button className="icon-button" aria-label="Activité"><Icon name="activity" /></button><button className="mobile-menu" aria-label="Menu"><Icon name="menu" /></button></div>
        </header>

        <div className="page-content">
          <section className="welcome-row">
            <div><div className="eyebrow"><span className="eyebrow-line" /> CENTRE DE COMMANDE</div><h1>Les idées deviennent<br /><span>des réalisations.</span></h1><p>Orchestrez vos projets, coordonnez vos agents IA et vérifiez chaque résultat.</p></div>
            <div className="date-chip"><span className="date-dot" /> NEXUS³ <span className="date-divider" /> MVP · Phase 0</div>
          </section>

          <section className="metric-grid" aria-label="Indicateurs du projet">
            <article className="metric-card"><div className="metric-top"><span>MISSIONS</span><span className="metric-icon cyan"><Icon name="layers" /></span></div><div className="metric-value">{missions.length}<small> missions</small></div><div className="metric-foot">Suivi du travail du projet</div></article>
            <article className="metric-card"><div className="metric-top"><span>AGENTS IA</span><span className="metric-icon violet"><Icon name="activity" /></span></div><div className="metric-value">03<small> rôles définis</small></div><div className="metric-foot">Connexions externes non activées</div></article>
            <article className="metric-card"><div className="metric-top"><span>VALIDATION</span><span className="metric-icon gold"><Icon name="check" /></span></div><div className="metric-value">01<small> vérifiée</small></div><div className="metric-foot">Preuves requises pour chaque livraison</div></article>
          </section>

          <section className="content-grid">
            <article className="panel missions-panel">
              <div className="panel-heading"><div><div className="eyebrow">EXÉCUTION</div><h2>Missions du projet</h2></div><button className="text-action" onClick={() => setActive('Missions')}>Tout voir <Icon name="arrow" /></button></div>
              <div className="mission-list">
                {missions.slice(0, 4).map((mission) => (
                  <div className="mission-row" key={mission.id}>
                    <div className="mission-check">{mission.progress === 100 ? <Icon name="check" /> : <span />}</div>
                    <div className="mission-main"><div className="mission-title">{mission.title}</div><div className="mission-meta">{mission.id} <span>·</span> {mission.owner}</div></div>
                    <div className="mission-state"><span className={mission.progress === 100 ? 'state verified' : mission.progress > 0 ? 'state review' : 'state todo'}>{mission.status}</span><div className="progress-track"><i style={{ width: `${mission.progress}%` }} /></div></div>
                  </div>
                ))}
              </div>
              <button className="add-mission" onClick={() => setShowNewMission((value) => !value)}><Icon name="plus" /> Nouvelle mission</button>
              {showNewMission && <form className="mission-form" onSubmit={addMission}><input autoFocus value={missionTitle} onChange={(event) => setMissionTitle(event.target.value)} placeholder="Nom de la mission…" aria-label="Nom de la mission" /><button type="submit">Créer</button></form>}
            </article>

            <article className="panel agents-panel">
              <div className="panel-heading"><div><div className="eyebrow">COLLABORATION</div><h2>Équipe d'agents</h2></div><span className="count-pill">03</span></div>
              <div className="agent-list">
                {agents.map((agent) => <div className="agent-row" key={agent.name}><div className={`agent-avatar ${agent.tone}`}>{agent.initials}</div><div className="agent-info"><strong>{agent.name}</strong><small>{agent.role}</small></div><span className="agent-status">{agent.status}</span></div>)}
              </div>
              <div className="agent-note"><span className="note-symbol">i</span><p>Les rôles sont définis. Les connexions Gemini et Claude seront activées après configuration et autorisation.</p></div>
            </article>
          </section>

          <section className="bottom-grid">
            <article className="panel principle-panel"><div className="eyebrow">LA MÉTHODE NEXUS</div><h2>Pas de résultat sans preuve.</h2><p>Une mission n'est considérée comme terminée qu'après vérification de ses critères d'acceptation et enregistrement des preuves.</p><div className="principle-tags"><span>MEMORY</span><span>DECOMPOSER</span><span>PROOF</span><span>REPAIR</span><span>GOVERN</span></div></article>
            <article className="panel activity-panel"><div className="panel-heading"><div><div className="eyebrow">JOURNAL</div><h2>Activité récente</h2></div><span className="live-label"><i /> LOCAL</span></div><div className="activity-entry"><span className="activity-mark"><Icon name="check" /></span><div><strong>Fondations du projet établies</strong><small>Documentation · Phase 0</small></div><time>18 NOV.</time></div><div className="activity-entry"><span className="activity-mark muted"><Icon name="clock" /></span><div><strong>Architecture technique à valider</strong><small>Prochaine étape</small></div><time>À VENIR</time></div></article>
          </section>
          <footer className="footer"><span>NEXUS³ <b>·</b> Construire avec méthode.</span><span>Prototype initial <b>·</b> Aucune intégration IA active</span></footer>
        </div>
      </main>
    </div>
  );
}

export default App;
