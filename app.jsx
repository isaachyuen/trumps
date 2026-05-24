{
// App shell: theme/edit wiring and top-level screen routing.
const { useState, useEffect } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "felt": "green",
  "density": "comfortable",
  "cardBack": "diamonds"
}/*EDITMODE-END*/;

function App() {
  const [tweaks, setTweaks] = useTweaks(TWEAK_DEFAULTS);
  const [editMode, setEditMode] = useState(false);
  const game = useGameState();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', tweaks.theme);
    document.documentElement.setAttribute('data-felt', tweaks.felt);
    document.documentElement.setAttribute('data-density', tweaks.density);
  }, [tweaks]);

  useEffect(() => {
    function onMsg(e) {
      const d = e.data || {};
      if (d.type === '__activate_edit_mode') setEditMode(true);
      else if (d.type === '__deactivate_edit_mode') setEditMode(false);
    }
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);

  if (!game.playMode) {
    return (
      <div className="app start-app">
        <StartScreen
          onStartLocal={game.startLocalGame}
          onHostGame={game.startHostedGame}
          onJoinGame={game.joinHostedGame}
          multiplayerError={game.multiplayer.error}
          multiplayerStatus={game.multiplayer.status}
        />
        {editMode && <Tweaks tweaks={tweaks} setTweaks={setTweaks} />}
      </div>
    );
  }

  if (game.playMode === 'host' && (!game.hands || !game.multiplayer.seat)) {
    return (
      <div className="app start-app">
        <LobbyScreen
          room={game.multiplayer.room}
          seat={game.multiplayer.seat}
          isHost={game.multiplayerRole === 'host'}
          error={game.multiplayer.error}
          onChooseSeat={game.multiplayer.chooseSeat}
          onStart={() => game.startMatch(game.matchHands)}
        />
        {editMode && <Tweaks tweaks={tweaks} setTweaks={setTweaks} />}
      </div>
    );
  }

  return <GameTable state={game} tweaks={tweaks} editMode={editMode} setTweaks={setTweaks} />;
}

function Tweaks({ tweaks, setTweaks }) {
  return (
    <TweaksPanel title="Tweaks">
      <TweakSection title="Theme">
        <TweakRadio value={tweaks.theme} onChange={(v) => setTweaks({ theme: v })}
          options={[{value:'light',label:'Light'},{value:'dark',label:'Dark'},{value:'sepia',label:'Sepia'}]} />
      </TweakSection>
      <TweakSection title="Felt color">
        <TweakRadio value={tweaks.felt} onChange={(v) => setTweaks({ felt: v })}
          options={[{value:'green',label:'Green'},{value:'blue',label:'Blue'},{value:'burgundy',label:'Burgundy'},{value:'charcoal',label:'Charcoal'}]} />
      </TweakSection>
      <TweakSection title="Density">
        <TweakRadio value={tweaks.density} onChange={(v) => setTweaks({ density: v })}
          options={[{value:'compact',label:'Compact'},{value:'comfortable',label:'Comfortable'},{value:'roomy',label:'Roomy'}]} />
      </TweakSection>
      <TweakSection title="Card back">
        <TweakRadio value={tweaks.cardBack} onChange={(v) => setTweaks({ cardBack: v })}
          options={[{value:'diamonds',label:'Diamonds'},{value:'weave',label:'Weave'},{value:'lines',label:'Lines'},{value:'solid',label:'Solid'}]} />
      </TweakSection>
    </TweaksPanel>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

}
