// Visual components for cards.
const { useMemo } = React;

function CardFace({ rank, suit }) {
  const isRed = suit === '\u2665' || suit === '\u2666';
  const suitClass = {
    '\u2663': 'clubs',
    '\u2666': 'diamonds',
    '\u2665': 'hearts',
    '\u2660': 'spades',
  }[suit] || '';
  const isFace = ['J','Q','K'].includes(rank);
  const isAce = rank === 'A';

  // pip layouts for number cards
  const pipLayout = useMemo(() => {
    if (isFace || isAce) return null;
    const n = parseInt(rank === 'A' ? '1' : rank, 10);
    return n;
  }, [rank, isFace, isAce]);

  return (
    <div className={`card-face ${isRed ? 'red' : ''} ${suitClass} ${isFace ? 'face-card' : ''}`}>
      <div className="corner tl">
        <div className="rank">{rank}</div>
        <div className="corner-suit">{suit}</div>
      </div>
      <div className="corner br">
        <div className="rank">{rank}</div>
        <div className="corner-suit">{suit}</div>
      </div>

      {isFace ? (
        <div className="face-letter" data-suit={suit}>{rank}</div>
      ) : isAce ? (
        <div className="center-suit">{suit}</div>
      ) : (
        <PipGrid n={pipLayout} suit={suit} />
      )}
    </div>
  );
}

// Render pip grids in classic playing-card layouts
function PipGrid({ n, suit }) {
  // positions in % of card area, in a 3-col x 5-row grid
  const layouts = {
    2:  [[2,1],[2,5]],
    3:  [[2,1],[2,3],[2,5]],
    4:  [[1,1],[3,1],[1,5],[3,5]],
    5:  [[1,1],[3,1],[2,3],[1,5],[3,5]],
    6:  [[1,1],[3,1],[1,3],[3,3],[1,5],[3,5]],
    7:  [[1,1],[3,1],[2,2],[1,3],[3,3],[1,5],[3,5]],
    8:  [[1,1],[3,1],[2,2],[1,3],[3,3],[2,4],[1,5],[3,5]],
    9:  [[1,1],[3,1],[1,2.3],[3,2.3],[2,3],[1,3.7],[3,3.7],[1,5],[3,5]],
    10: [[1,1],[3,1],[1,2.2],[3,2.2],[2,1.9],[2,4.1],[1,3.8],[3,3.8],[1,5],[3,5]],
  };
  const positions = layouts[n] || Array.from({ length: n }, (_, i) => [
    i % 2 === 0 ? 1 : 3,
    Math.floor(i / 2) + 1,
  ]);

  return (
    <div style={{
      position: 'absolute',
      inset: '31% 37% 36%',
    }}>
      {positions.map(([col, row], i) => (
        <span key={i} className={`pip-suit ${suit === '\u2663' ? 'clubs' : suit === '\u2660' ? 'spades' : ''}`} style={{
          position: 'absolute',
          left: `${((col - 1) / 2) * 100}%`,
          top: `${((row - 1) / 4) * 100}%`,
          fontSize: 'calc(var(--card-w) * 0.18)',
          lineHeight: 1,
          fontFamily: '"Bookman Old Style", serif',
          transform: `translate(-50%, -50%) ${row > 3 ? 'rotate(180deg)' : ''}`,
        }}>{suit}</span>
      ))}
    </div>
  );
}

function CardBack({ pattern = 'diamonds' }) {
  return <div className={`card-back ${pattern}`} />;
}

Object.assign(window, { CardFace, CardBack });
