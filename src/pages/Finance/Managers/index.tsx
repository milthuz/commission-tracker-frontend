// Module Finance — gestionnaires (lot D). Trois écrans, à monter sous /finance/* (dans le
// FinanceProvider existant ; ils chargent leurs propres données et n'en dépendent pas) :
//   /finance/deferred-revenue     DeferredRevenue   finance:deferred
//   /finance/terminal-amortization Amortization     finance:amortization
//   /finance/books-accounts       BooksAccounts     finance:post_je (+ l'un des deux)
export { default as DeferredRevenue } from './DeferredRevenue';
export { default as TerminalAmortization } from './Amortization';
export { default as BooksAccounts } from './BooksAccounts';
export { default } from './DeferredRevenue';
