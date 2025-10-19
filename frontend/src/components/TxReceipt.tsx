import { ReactNode } from "react";
import { clsx } from "clsx";

export type TxEvent = {
  name: string;
  args: Record<string, unknown>;
};

export type TxReceipt = {
  hash: string;
  blockNumber: number;
  events: TxEvent[];
};

type TxReceiptProps = {
  receipt: TxReceipt | null;
  title: ReactNode;
  explorerBase: string;
};

export const TxReceiptCard = ({ receipt, title, explorerBase }: TxReceiptProps) => {
  if (!receipt) {
    return null;
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 shadow-inner">
      <h4 className="text-sm font-semibold text-emerald-400">{title}</h4>
      <div className="mt-2 space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Tx Hash</span>
          <a
            className="font-mono text-emerald-300 hover:underline"
            href={`${explorerBase}/tx/${receipt.hash}`}
            target="_blank"
            rel="noreferrer"
          >
            {receipt.hash.slice(0, 10)}…
          </a>
        </div>
        <div className="flex items-center justify-between text-slate-400">
          <span>Block</span>
          <span className="text-slate-200">{receipt.blockNumber}</span>
        </div>
        {receipt.events.length > 0 && (
          <div>
            <span className="text-slate-400">Events</span>
            <div className="mt-1 space-y-1">
              {receipt.events.map((event, index) => (
                <div
                  key={`${event.name}-${index}`}
                  className={clsx(
                    "rounded-md border border-slate-800 bg-slate-950/60 p-2 font-mono text-xs text-slate-300"
                  )}
                >
                  <div className="text-emerald-300">{event.name}</div>
                  <div className="mt-1 space-y-1">
                    {Object.entries(event.args).map(([key, value]) => (
                      <div key={key} className="flex justify-between gap-4">
                        <span>{key}</span>
                        <span className="truncate">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
