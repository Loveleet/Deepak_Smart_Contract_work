import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export const TxReceiptCard = ({ hash, label, explorerBase }) => {
    if (!hash) {
        return null;
    }
    return (_jsxs("div", { className: "rounded-lg border border-slate-800 bg-slate-900/60 p-4 shadow-inner", children: [_jsx("h4", { className: "text-sm font-semibold text-emerald-400", children: label }), _jsxs("div", { className: "mt-2 text-sm text-slate-300", children: [_jsx("div", { children: "Transaction submitted successfully." }), _jsx("a", { className: "mt-1 block font-mono text-emerald-300 hover:underline", href: `${explorerBase}/tx/${hash}`, target: "_blank", rel: "noreferrer", children: hash })] })] }));
};
