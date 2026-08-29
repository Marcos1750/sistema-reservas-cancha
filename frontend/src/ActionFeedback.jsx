export function ActionFeedback({ message, tone = 'success', className = '' }) {
  if (!message) return null;
  const isError = tone === 'error';
  return (
    <p
      className={`action-feedback action-feedback--${isError ? 'error' : 'success'}${className ? ` ${className}` : ''}`}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
    >
      {message}
    </p>
  );
}
