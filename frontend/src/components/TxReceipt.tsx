type TxReceiptProps = {
  hash: string | null;
  label: string;
  explorerBase: string;
};

export const TxReceiptCard = ({ hash, label, explorerBase }: TxReceiptProps) => {
  if (!hash) {
    return null;
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 shadow-inner">
      <h4 className="text-sm font-semibold text-emerald-400">{label}</h4>
      <div className="mt-2 text-sm text-slate-300">
        <div>Transaction submitted successfully.</div>
        <a
          className="mt-1 block font-mono text-emerald-300 hover:underline"
          href={`${explorerBase}/tx/${hash}`}
          target="_blank"
          rel="noreferrer"
        >
          {hash}
        </a>
      </div>
    </div>
  );
};
