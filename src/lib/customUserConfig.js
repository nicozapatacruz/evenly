// Config de cosas hechas a medida para un usuario puntual, no features
// genéricas de la app — centralizado acá (por email) para no ir repartiendo
// `if (session.email === "...")` sueltos por distintos archivos. Cada clave
// de usuario solo trae los campos que a ESA persona le aplican; nada obliga
// a que dos usuarios tengan la misma config custom.
// Una customización vive fuera de este archivo, del lado de la base: la
// función Postgres `sync_split_category_to_other_members` (SECURITY
// DEFINER) -- cuando Nico o Paulina elige "Categoría personal" en un gasto
// compartido, esa función le rellena (si está vacía) la categoría
// equivalente al OTRO miembro vinculado, en SU propio EvenCapital. Tiene
// que vivir en la base porque cada uno, desde su propia sesión, no tiene
// permiso (RLS) para escribir en las tablas del otro -- no se puede hacer
// desde acá.
export const CUSTOM_USER_CONFIG = {
  "nicozapatacruz@gmail.com": {
    // "Saldo Real" (CuentasTab.jsx): balance real = Saldo + Pendiente + la
    // tarjeta (deuda) + la cuenta pseudo del grupo de EvenGroup vinculado
    // (groupName, el nombre real del grupo -- esa cuenta se llama igual).
    realBalance: { group: "Santander", saldoName: "Saldo", tcName: "TC Santander", pendienteName: "Pendiente", groupName: "Nottinghill" },
    // Auto-suma a "Pendiente TC" (evenGroupSync.js): cuando creás un gasto
    // en el grupo de EvenGroup indicado, pagado con la cuenta indicada,
    // y prestás una parte, esa parte se suma sola a la transacción manual
    // "Pendiente TC" (transferencia de esa cuenta a la cuenta de "lo
    // prestado" de ESE gasto puntual) que ya manejás vos mismo mes a mes, en
    // vez de tener que sumarla a mano. No hay un "pendienteAccountName" fijo
    // a propósito: hay más de una cuenta "Pendiente" (una por grupo de
    // cuentas), así que la cuenta real se resuelve por gasto, nunca por nombre.
    pendienteTcAutoSum: { splitGroupName: "Nottinghill", tcAccountName: "TC Santander", pendienteTcTitle: "Pendiente TC" },
  },
  "paulina.sanchezbt@gmail.com": {
    realBalance: { group: "Santander", saldoName: "Saldo", tcName: "Tarjeta", pendienteName: "Pendiente" },
  },
};
