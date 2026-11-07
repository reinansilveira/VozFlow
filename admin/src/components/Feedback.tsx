import type { ReactElement } from 'react';
import type { ActionFeedback } from '../hooks/use-action';

export const Feedback = ({ feedback }: { feedback: ActionFeedback }): ReactElement | null => {
  if (!feedback) return null;
  return <p className={`feedback ${feedback.isError ? 'feedback--error' : 'feedback--success'}`} role={feedback.isError ? 'alert' : 'status'}>
    {feedback.message}
  </p>;
};
