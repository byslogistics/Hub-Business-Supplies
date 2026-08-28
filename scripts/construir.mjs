/**
 * Arma `publico/`, que es lo que Cloudflare sirve.
 *
 *   publico/index.html      la portada del hub, copiada tal cual
 *   publico/assets/         su logo
 *   publico/correo/         la pantalla de correo comercial, copiada tal cual
 *   publico/cotizador/      el cotizador ya construido
 *
 * La portada y el correo no se construyen: son `index.html` con los estilos
 * dentro y sin dependencias, y esa propiedad —abrirlos con doble clic y verlos
 * igual que publicados— vale más que meterlos en el empaquetador para no
 * ganar nada.
 */

import { execFileSync } from 'node:child_process';
import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = dirname(dirname(fileURLToPath(import.meta.url)));
const destino = join(raiz, 'publico');

await rm(destino, { recursive: true, force: true });
await mkdir(destino, { recursive: true });

// El cotizador primero: si falla la comprobación de tipos o una prueba, se
// para aquí y `publico/` queda vacío en vez de a medias.
console.log('· Construyendo el cotizador…');
execFileSync(
  'npm',
  ['--prefix', 'cotizador', 'run', 'build', '--', '--outDir', '../publico/cotizador', '--emptyOutDir'],
  { cwd: raiz, stdio: 'inherit' },
);

console.log('· Copiando la portada y el correo…');
for (const archivo of ['index.html', 'assets', 'correo']) {
  await cp(join(raiz, archivo), join(destino, archivo), { recursive: true });
}

// `correo/plantillas.js` importa el equipo desde `../compartido/equipo.js`, y
// el navegador lo pide tal cual: sin compilar y sin empaquetar. Si no viaja, la
// pantalla de correo se queda en blanco con un 404 en la consola.
//
// Se copia ese archivo y no la carpeta entera a propósito: el resto de
// `compartido/` es TypeScript que no se sirve a nadie.
await mkdir(join(destino, 'compartido'), { recursive: true });
await cp(join(raiz, 'compartido', 'equipo.js'), join(destino, 'compartido', 'equipo.js'));

console.log(`Listo. \`publico/\` preparado para \`wrangler deploy\`.`);
