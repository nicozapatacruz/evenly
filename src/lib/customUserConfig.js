// Config de cosas hechas a medida para un usuario puntual, no features
// genéricas de la app — centralizado acá (por email) para no ir repartiendo
// `if (session.email === "...")` sueltos por distintos archivos. Cada clave
// de usuario solo trae los campos que a ESA persona le aplican; nada obliga
// a que dos usuarios tengan la misma config custom.
export const CUSTOM_USER_CONFIG = {
  "nicozapatacruz@gmail.com": {
    // "Saldo Real" (CuentasTab.jsx): balance real = Saldo + la tarjeta
    // (deuda) + lo pendiente de cobro por tarjeta (ver pendienteTcAutoSum).
    realBalance: { group: "Santander", saldoName: "Saldo", tcName: "TC Santander", pendienteName: "Pendiente" },
    // Auto-suma a "Pendiente TC" (splitLedgerSync.js): cuando creás un gasto
    // en el grupo de Split Ledger indicado, pagado con la cuenta indicada,
    // y prestás una parte, esa parte se suma sola a la transacción manual
    // "Pendiente TC" (transferencia de esa cuenta a "Pendiente") que ya
    // manejás vos mismo mes a mes, en vez de tener que sumarla a mano.
    pendienteTcAutoSum: { splitGroupName: "Nottinghill", tcAccountName: "TC Santander", pendienteAccountName: "Pendiente", pendienteTcTitle: "Pendiente TC" },
  },
  "paulina.sanchezbt@gmail.com": {
    realBalance: { group: "Santander", saldoName: "Saldo", tcName: "Tarjeta", pendienteName: "Pendiente" },
  },
};
