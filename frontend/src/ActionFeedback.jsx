import { useEffect, useRef } from 'react';
import { useToast } from './components/motion/animated-toast-stack';

export function ActionFeedback({ message, tone = 'success', className = '' }) {
  const { notify } = useToast();
  const previousMessage = useRef('');
  useEffect(() => {
    if (!message || message === previousMessage.current) return;
    previousMessage.current = message;
    notify({ title: tone === 'error' ? 'No se pudo completar' : 'Listo', description: message, status: tone === 'error' ? 'error' : 'success' });
  }, [message, notify, tone]);
  useEffect(() => { if (!message) previousMessage.current = ''; }, [message]);
  if (!message) return null;
  const isError = tone === 'error';
  return (
    <p
      className={`action-feedback action-feedback--${isError ? 'error' : 'success'}${className ? ` ${className}` : ''}`}
    >
      {message}
    </p>
  );
}
