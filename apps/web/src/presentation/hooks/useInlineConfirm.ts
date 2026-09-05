import { useEffect, useRef, useState } from 'react';

type ConfirmStep = 'idle' | 'confirming';

export interface InlineConfirm<
  TriggerEl extends HTMLElement = HTMLButtonElement,
  ConfirmEl extends HTMLElement = HTMLDivElement,
> {
  isConfirming: boolean;
  triggerRef: React.RefObject<TriggerEl | null>;
  confirmRef: React.RefObject<ConfirmEl | null>;
  requestConfirm(): void;
  cancel(): void;
}

/**
 * A one-tap irreversible action becomes two taps, with focus carried across
 * both: the trigger when cancelling back to it, the confirm panel when it
 * first appears. Shared by every place in the app that asks "are you sure?"
 * inline rather than in a modal.
 */
export function useInlineConfirm<
  TriggerEl extends HTMLElement = HTMLButtonElement,
  ConfirmEl extends HTMLElement = HTMLDivElement,
>(): InlineConfirm<TriggerEl, ConfirmEl> {
  const [step, setStep] = useState<ConfirmStep>('idle');
  const [pendingFocus, setPendingFocus] = useState(false);

  const triggerRef = useRef<TriggerEl>(null);
  const confirmRef = useRef<ConfirmEl>(null);

  useEffect(() => {
    if (!pendingFocus) {
      return;
    }
    const target = step === 'confirming' ? confirmRef.current : triggerRef.current;
    target?.focus();
    setPendingFocus(false);
  }, [pendingFocus, step]);

  const requestConfirm = () => {
    setStep('confirming');
    setPendingFocus(true);
  };

  const cancel = () => {
    setStep('idle');
    setPendingFocus(true);
  };

  return { isConfirming: step === 'confirming', triggerRef, confirmRef, requestConfirm, cancel };
}
