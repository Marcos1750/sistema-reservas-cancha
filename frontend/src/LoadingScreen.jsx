import { PitchMark } from './icons';

export function LoadingScreen({ message }) {
  return (
    <div className="loading-screen" role="status" aria-live="polite" aria-label={message}>
      <div className="loading-screen__field" aria-hidden="true">
        <span className="loading-screen__spot loading-screen__spot--one" />
        <span className="loading-screen__spot loading-screen__spot--two" />
        <span className="loading-screen__spot loading-screen__spot--three" />
      </div>
      <div className="loading-screen__content">
        <div className="loading-screen__brand" aria-hidden="true">
          <PitchMark compact />
          <span>NEW MATCH</span>
        </div>
        <div className="loading-screen__progress" aria-hidden="true"><span /></div>
        <p>{message}</p>
      </div>
    </div>
  );
}
