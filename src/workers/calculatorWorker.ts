import { calculateAll } from '../lib/calculations';
import type { CalculationInput, CalculationResult } from '../types';

type WorkerRequest = {
  type: 'calculate';
  requestKey: string;
  payload: CalculationInput;
};

type WorkerResponse = {
  type: 'result';
  requestKey: string;
  payload: CalculationResult;
};

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  if (event.data.type !== 'calculate') {
    return;
  }

  const payload = calculateAll(event.data.payload);
  const response: WorkerResponse = {
    type: 'result',
    requestKey: event.data.requestKey,
    payload,
  };

  self.postMessage(response);
};

export {};
