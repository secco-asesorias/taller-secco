# AGENTS.md — SECCO Sistema de Taller

Archivo de contexto compartido entre agentes de código (Claude Code, Codex, Cursor, Copilot, etc.).
Leer este archivo antes de modificar cualquier parte del proyecto.

---

## 1. Descripción del proyecto

Web app **mobile-first** para digitalizar la operación del taller mecánico SECCO.
Módulos actuales y planificados:

| Módulo | Estado |
|---|---|
| Acta de Recepción | ✅ Implementado |
| Diagnóstico | ✅ Implementado |
| Presupuesto / Cotización | ✅ Implementado |
| Orden de Trabajo (OT) | ✅ Implementado |
| Vista Técnico | ✅ Implementado |
| Autenticación por rol (RBAC) | ✅ Implementado |
| Real-time multiusuario | ✅ Implementado |
| Historial acordeón + descarga ZIP | ✅ Implementado |
| Soft lock (bloqueo de edición) | ✅ Infraestructura lista |

---

## 2. Flujo general del sistema

```
Torre de Control                    Técnico                    Encargado de Taller
       │                               │                               │
  Llena S1-S2                         │                               │
  (Cliente + Vehículo)                │                               │
       │                               │                               │
       │── guarda borrador ──────────▶ busca por patente               │
       │                          retoma desde S3                      │
       │                          llena S3-S8                          │
       │                          (Inspección + Firmas)                │
       │                               │                               │
       │                          cierra acta ────────────────────────▶│
       │                               │                               │
       │                    ◀── auto-crea Diagnóstico ──────────────── │
       │                               │                               │
       │                          abre Diagnóstico                     │
       │                          completa checklist                   │
       │                          sube fotos por sección               │
       │                          marca Diagnóstico listo              │
       │                               │                               │
       │            [realtime badge] ──│────── notifica ─────────────▶ │
       │                               │                          construye Presupuesto
       │                               │                          genera vista cliente
       │                               │                          envía al cliente
       │                               │                          cliente aprueba
       │                               │◀────── genera OT ─────────│
       │                          ve repuestos + instrucciones
       │                          ejecuta y avanza estados
```

### Regla crítica del acta
- **Torre de Control** crea el acta (S1–S2: datos de cliente y vehículo).
- **Técnico** la termina (S3–S8: inspección, fotos, firmas).
- El traspaso ocurre cuando Torre guarda el borrador al pasar S2→S3; el Técnico busca por patente en su dispositivo y retoma desde S3.
- **Ninguno de los dos re-ingresa datos del otro.**

---

## 3. Stack tecnológico

| Capa | Tecnología |
|---|---|
| Framework | React 19 + Vite 8 |
| Estilos | Tailwind CSS v4 (`@tailwindcss/vite`) + CSS custom properties |
| Base de datos | Supabase (PostgreSQL) |
| Almacenamiento | Supabase Storage — bucket `fotos-actas` |
| Auth | Supabase Auth — email/contraseña con RBAC por roles |
| PDF | jsPDF (client-side, sin html2canvas) |
| ZIP descarga múltiple | JSZip (carga dinámica en historial) |
| Real-time | Supabase Realtime Channels |

---

## 4. Estructura de archivos

```
secco-app/
├── public/
│   └── logo-secco.png
├── src/
│   ├── main.jsx
│   ├── App.jsx                    ← HomeScreen + ActaForm + Root + routing + auth gate
│   ├── DiagnosticoForm.jsx        ← Módulo de diagnóstico técnico
│   ├── PresupuestoForm.jsx        ← Módulo de cotización (spreadsheet)
│   ├── OTForm.jsx                 ← Torre de Control — gestión de OT
│   ├── TecnicoScreen.jsx          ← Vista Técnico — lista y detalle de OTs
│   ├── index.css                  ← Variables CSS, clases utilitarias
│   ├── context/
│   │   ├── AuthContext.jsx        ← AuthProvider, useAuth(), useRol()
│   │   ├── FormContext.jsx        ← Estado global del acta (+ sessionStorage)
│   │   └── DiagnosticoContext.jsx ← Estado global del diagnóstico (+ sessionStorage)
│   ├── lib/
│   │   ├── auth.js                ← login(), logout(), cargarPerfil(), listarUsuarios()
│   │   ├── realtime.js            ← suscribirTabla(), suscribirFila()
│   │   ├── softlock.js            ← reclamarLock(), renovarLock(), liberarLock()
│   │   ├── supabase.js            ← TODAS las operaciones con Supabase
│   │   ├── pdf.js                 ← PDF del acta (soporta { returnBlob: true })
│   │   ├── pdfPresupuesto.js      ← PDF de cotización (soporta { returnBlob: true })
│   │   └── validation.js          ← Validaciones por sección
│   └── components/
│       ├── LoginScreen.jsx        ← Pantalla de login (email + contraseña)
│       ├── common/
│       │   ├── ProgressBar.jsx
│       │   ├── SignaturePad.jsx
│       │   ├── PhotoCapture.jsx
│       │   └── FuelSelector.jsx
│       └── sections/              ← S1–S8 del acta de recepción
├── .env
├── supabase_schema.sql            ← Schema base (ejecutar primero)
├── supabase_migration.sql         ← Migration: auth, roles, soft lock, RLS (ejecutar segundo)
├── supabase_fix_rls.sql           ← Fix específico si se detecta recursión en perfiles
└── AGENTS.md
```

---

## 5. Variables de entorno (`.env`)

```
VITE_SUPABASE_URL=https://<proyecto>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...   ← Usar ANON key (JWT), NO la service_role key
```

`supabaseConfigurado()` detecta si hay credenciales. Sin ellas, la app corre en modo offline (PDFs locales).

---

## 6. Paleta de colores — regla absoluta

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#FFFFFF` | Fondo principal de toda la app |
| `--surface` | `#F5F5F5` | Cards, inputs, superficies elevadas |
| `--border` | `#E0E0E0` | Bordes, separadores |
| `--gold` | `#a98225` | Acento — botones, badges, selecciones activas |
| `--muted` | `#6B6B6B` | Texto secundario, labels |
| `--danger` | `#FF453A` | Errores |

**No usar negro como fondo.** App completamente blanca + dorado. Texto principal `#111114`.

### PDF (`src/lib/pdf.js`)
```js
const GOLD   = [169, 130, 37]   // títulos de sección (caja dorada)
const GRIS   = [107, 107, 107]  // labels
const GRIS_L = [229, 229, 229]  // separadores
const BLANCO = [255, 255, 255]  // fondo de página
const TEXTO  = [20, 20, 20]     // texto cuerpo
```

---

## 7. Clases CSS globales (index.css)

| Clase | Uso |
|---|---|
| `.s-input` | Campos de texto, select, textarea |
| `.s-label` | Labels (uppercase, muted) |
| `.s-card` | Contenedor elevado |
| `.s-btn-primary` | Botón principal — fondo dorado, texto blanco |
| `.s-btn-secondary` | Botón secundario — borde dorado |
| `.s-checkbox` | Checkbox dorado |
| `.s-error` | Error rojo bajo campo |
| `.s-divider` | Línea separadora |
| `.section-enter` | Animación entrada de sección |
| `.check-animate` | Animación pop checkmark |

---

## 8. Sistema de autenticación y roles (RBAC)

### 8.1 Arquitectura

- Auth via **Supabase Auth** (email + contraseña).
- Tabla `perfiles` vinculada a `auth.users` (trigger la crea automáticamente al registrar un usuario).
- Rol por defecto al crear usuario: `tecnico`.
- Roles disponibles: `admin` | `tecnico` | `recepcionista`.

### 8.2 Hooks disponibles

```js
// src/context/AuthContext.jsx
const { usuario, perfil, cargando } = useAuth()
const { rol, nombre, esAdmin, esTecnico, esRecepcionista,
        puedeVerPresupuestos, puedeVerHistorial,
        puedeCrearActa, puedeEditarDiagnostico, puedeGestionarOTs } = useRol()
```

### 8.3 Permisos por rol

| Funcionalidad | admin | tecnico | recepcionista |
|---|---|---|---|
| Ver y editar Presupuestos/Cotizaciones | ✅ | ❌ | ❌ |
| Ver Historial completo | ✅ | ❌ | ✅ |
| Crear Acta | ✅ | ✅ | ✅ |
| Completar Acta (S3–S8) | ✅ | ✅ | ❌ |
| Ver Diagnósticos | ✅ (todos) | ✅ (asignados) | solo lectura |
| Gestionar OTs | ✅ (todas) | ✅ (propias) | ❌ |
| Gestionar usuarios/roles | ✅ | ❌ | ❌ |

### 8.4 RLS en Supabase

Todas las tablas tienen RLS activo. Las políticas usan dos funciones SECURITY DEFINER que evitan recursión:

```sql
public.mi_rol()    -- retorna 'admin' | 'tecnico' | 'recepcionista' | NULL
public.mi_nombre() -- retorna el nombre del perfil del usuario actual
```

**IMPORTANTE:** Nunca hacer `SELECT FROM perfiles` directamente dentro de una política RLS de `perfiles` — causa recursión infinita. Siempre usar `public.mi_rol()`.

### 8.5 Gestión de usuarios

1. Crear usuario desde **Supabase Dashboard → Authentication → Users** (Add user).
2. El trigger `on_auth_user_created` crea automáticamente el perfil con rol `tecnico`.
3. Cambiar rol manualmente:
```sql
UPDATE perfiles SET rol = 'admin' WHERE id = '<UUID>';
```

---

## 9. Persistencia y sincronización

### 9.1 sessionStorage (anti-pérdida de datos)

`FormContext` y `DiagnosticoContext` guardan automáticamente su estado en `sessionStorage` en cada cambio. Si el usuario recarga el browser accidentalmente mientras llena un formulario, los datos se recuperan al volver.

- Clave del acta: `secco_acta_draft`
- Clave del diagnóstico: `secco_diagnostico_draft`
- `resetForm()` y `resetDiagnostico()` eliminan el draft guardado.
- Campos File (foto_km, foto_combustible) se excluyen de la serialización.

### 9.2 Real-time (Supabase Channels)

Suscripciones activas en HomeScreen:
- `diagnosticos` → cuando status cambia a `listo`, aparece badge rojo en tab Presupuestos e invalida el caché.
- `ordenes_trabajo` → cualquier cambio genera badge rojo en tab OTs e invalida el caché.

```js
// src/lib/realtime.js
suscribirTabla(tabla, callback)   // suscribe a todos los eventos de una tabla
suscribirFila(tabla, columna, valor, callback)  // suscribe a una fila específica
// Ambas retornan una función cleanup para usar en useEffect return
```

### 9.3 Soft lock (bloqueo suave de edición)

Tabla `sesiones_edicion` en la BD registra quién está editando qué documento. El lock expira a los 2 minutos si no se renueva.

```js
// src/lib/softlock.js
reclamarLock(tabla, registroId, usuarioId, nombre)  // retorna null si ok, { bloqueadoPor } si ocupado
renovarLock(tabla, registroId, usuarioId)           // llamar cada ~90s
liberarLock(tabla, registroId, usuarioId)           // llamar al cerrar formulario
consultarLock(tabla, registroId)                    // quién está editando (sin reclamar)
```

Pendiente de integrar en PresupuestoForm y OTForm (infraestructura lista, falta UI de banner).

---

## 10. FormContext — estado global del acta

```js
const { formData, updateForm, resetForm, cargarDesdeActa } = useForm()
```

Campos clave de `formData`:
```js
{
  acta_id, numero_acta,
  // S1
  nombre, rut, telefono, email,
  // S2
  marca, modelo, anio, patente, vin, color,
  // S3
  fecha_ingreso, hora_ingreso, kilometraje, combustible,
  llaves, documentacion, foto_km_preview, foto_combustible_preview,
  // S4
  estado_exterior, detalle_exterior, estado_interior, detalle_interior,
  fotos: { frontal, trasera, lateral_izq, lateral_der, interior, danos },
  // S5
  trabajo_solicitado,
  // S6
  nombre_cliente, fecha_firma_cliente, acepta_declaracion, firma_cliente,
  // S7
  nombre_responsable, cargo_responsable, fecha_firma_secco, firma_secco,
}
```

---

## 11. Supabase — esquema y funciones del acta

Tablas: `clientes`, `vehiculos`, `actas`, `fotos_acta`

Funciones clave en `supabase.js`:
```js
guardarBorrador(formData)
buscarBorradorPorPatente(patente)
actualizarActa(id, datos)
listarActasCerradas(limite)
cargarActaCompleta(actaId)
mapearActaParaPDF(acta)
subirFotoBase64(actaId, tipo, b64)
```

---

## 12. Generación de PDF (`src/lib/pdf.js`, `src/lib/pdfPresupuesto.js`)

```js
// Descarga directa al browser
generarPDFActa(formData)
generarPDFDesdeActaGuardada(acta)
generarPDFPresupuestoCliente(cotizacion)
generarPDFPresupuestoInterno(cotizacion)

// Retorna Blob (para generar ZIP en historial)
generarPDFActa(formData, { returnBlob: true })
generarPDFDesdeActaGuardada(acta, { returnBlob: true })
generarPDFPresupuestoCliente(cotizacion, { returnBlob: true })
generarPDFPresupuestoInterno(cotizacion, { returnBlob: true })
```

- Logo cacheado en `_logoCache`. Sin logo → texto "SECCO".
- Fotos remotas descargadas vía `loadImageAsBase64(url)`.
- Sin `html2canvas`. Coordenadas manuales en mm, A4 (210×297mm).

### Descarga múltiple (historial)

El botón "Descargar todo (.zip)" en el historial usa **JSZip** (importado dinámicamente):
```js
const JSZip = (await import('jszip')).default
```
Genera un `.zip` con todos los PDFs del vehículo nombrados `Acta_042.pdf`, `Cotizacion_018.pdf`, etc.

---

## 13. Historial de vehículos (acordeón)

El tab Historial muestra los vehículos como elementos colapsables. Disponible para roles `admin` y `recepcionista`.

Estructura por vehículo al expandir:
- Actas (con botón de descarga PDF individual)
- Diagnósticos (sin PDF propio, solo info)
- Cotizaciones (con botón de descarga PDF cliente)
- Botón "Descargar todo (.zip)" si hay actas o cotizaciones

Estado local en HomeScreen:
```js
const [vehiculosAbiertos, setVehiculosAbiertos] = useState({}) // { [patente]: boolean }
```

---

## 14. Módulo Diagnóstico — diseño completo

### 14.1 Principio fundamental

Al cerrar el acta (cuando el Técnico finaliza S8), el sistema **crea automáticamente** un registro de diagnóstico vinculado.
El diagnóstico se llama `"Diagnóstico - [PATENTE]"` y hereda todos los datos del acta sin re-ingreso.

### 14.2 Datos heredados automáticamente desde el acta

| Campo | Fuente |
|---|---|
| Patente | `vehiculos.patente` |
| Marca / Modelo / Año / Color / VIN | `vehiculos.*` |
| Kilometraje | `actas.km` |
| Nombre cliente | `clientes.nombre` |
| Teléfono cliente | `clientes.telefono` |
| Trabajo solicitado | `actas.trabajo_solicitado` |
| Número de acta | `actas.numero_acta` |
| Fecha de ingreso | `actas.fecha_ingreso` |
| Técnico receptor | `actas.tecnico_nombre` |

**Las imágenes del acta NO se heredan.** El diagnóstico tiene sus propias secciones de fotos.

### 14.3 Checklist técnico — secciones y campos

Cada ítem del checklist tiene:
- `estado`: `ok` | `requiere_atencion` | `urgente` | `no_aplica`
- `observacion`: texto libre opcional

Las secciones marcadas con 📷 tienen **upload de fotos al terminar la sección** (múltiples imágenes).
La sección marcada con 🚫📷 **no tiene fotos**.

---

#### Sección 1 — Compartimiento Motor 📷
```
- Aceite de motor: nivel y condición
- Refrigerante: nivel y condición
- Líquido de frenos
- Líquido de dirección hidráulica (si aplica)
- Aceite de transmisión (si aplica / verificable)
- Líquido limpiaparabrisas
- Filtro de aire
- Filtro de polen
- Filtro de aceite / condición visible
- Correas auxiliares
- Mangueras y conexiones visibles
- Fugas visibles de motor o refrigeración
- Soportes de motor visibles
- Estado general del motor
```

#### Sección 2 — Sistema de Frenos 📷
```
- Pastillas delanteras
- Pastillas traseras
- Discos delanteros
- Discos traseros
- Flexibles / líneas visibles
- Fugas del sistema
- Freno de estacionamiento
```

#### Sección 3 — Dirección y Suspensión Delantera 📷
```
- Cremallera de dirección
- Terminales / axiales
- Bandejas / bujes / rótulas
- Bieletas / barra estabilizadora
- Amortiguadores delanteros
- Espirales / cazoletas / guardapolvos
- Homocinéticas / fuelles
- Observación general tren delantero
```

#### Sección 4 — Suspensión Trasera 📷
```
- Bujes / brazos / bandejas traseras
- Amortiguadores traseros
- Espirales / soportes / guardapolvos
- Bieletas / barra estabilizadora si aplica
- Rodamientos / holguras visibles si aplica
- Observación general tren trasero
```

#### Sección 5 — Transmisión y Bajos 📷
```
- Fugas de transmisión
- Fugas de diferencial / transfer si aplica
- Estado inferior de motor y caja
- Semiejes / palieres si aplica
- Escape y soportes
- Observación general de bajos
```

#### Sección 6 — Neumáticos y Ruedas 📷
```
- Neumáticos delanteros
- Neumáticos traseros
- Desgaste irregular
- Presión / condición general
- Repuesto si aplica
- Comentario general de neumáticos
```

#### Sección 7 — Escaneo y Funcionamiento 📷
```
- Testigos / escaneo si aplica
- Códigos relevantes
- Estado básico de batería / carga si aplica
- Observación general de funcionamiento
```

#### Sección 8 — Prueba de Ruta 🚫📷
```
- Motor
- Transmisión
- Frenos
- Dirección / alineación
- Ruidos de suspensión
- Vibraciones
- Temperatura de operación
- Comentario prueba de ruta
```

#### Sección 9 — Diagnóstico Final 📷
```
- Hallazgos principales
- Trabajos recomendados
- Prioridad: urgente / recomendable / preventivo
- Comentario final del técnico
```

---

### 14.4 Lógica de clasificación de mantención

El sistema **sugiere** el tipo según las respuestas del checklist. El técnico confirma o ajusta.

```
BÁSICA — se sugiere siempre que haya una mantención preventiva:
  Items base: aceite motor + filtro aceite + filtro aire + filtro polen
              + tapón/golilla + escáner + revisión general

INTERMEDIA — básica + al menos uno de:
  · Bujías con estado "requiere_atencion" o "urgente"
  · Pastillas de freno con estado "requiere_atencion" o "urgente"
  · Líquido de frenos con estado "requiere_atencion"

FULL — intermedia + al menos uno de:
  · Neumáticos con estado "urgente"
  · Discos con estado "urgente"
  · Amortiguadores con estado "urgente"
  · Cualquier ítem de suspensión mayor con estado "urgente"
```

Todas las mantenciones incluyen: revisión general + posible rotación de neumáticos según corresponda.
Se pueden agregar **extras** sobre cualquier paquete base.

---

### 14.5 Estados del flujo completo

```
acta_generada          → Acta cerrada por el Técnico
diagnostico_pendiente  → Diagnóstico creado automáticamente, aún no abierto
diagnostico_proceso    → Técnico abrió y está completando
diagnostico_listo      → Técnico marcó como completo
presupuesto_prep       → Encargado construyendo el presupuesto
presupuesto_listo      → Calculado, pendiente de envío
presupuesto_enviado    → Cliente recibió vista comercial
aprobado               → Cliente aprobó
rechazado              → Cliente rechazó o pidió ajuste
en_ejecucion           → Trabajo autorizado, en taller
cerrado                → Vehículo entregado
```

Transiciones válidas:
```
acta_generada → diagnostico_pendiente  (automático al cerrar acta)
diagnostico_pendiente → diagnostico_proceso  (técnico abre)
diagnostico_proceso → diagnostico_listo  (técnico confirma)
diagnostico_listo → presupuesto_prep  (encargado inicia)
presupuesto_prep → presupuesto_listo
presupuesto_listo → presupuesto_enviado
presupuesto_enviado → aprobado | rechazado
aprobado → en_ejecucion → cerrado
```

---

### 14.6 Estructura de tablas (Diagnóstico)

```sql
diagnosticos (
  id UUID PRIMARY KEY,
  numero_diagnostico  SERIAL UNIQUE,        -- DG-001, DG-002...
  acta_id             UUID FK → actas,
  nombre              TEXT,                 -- "Diagnóstico - BCDF45" (auto)
  status              TEXT,                 -- enum de estados
  tipo_mantencion     TEXT,                 -- basica | intermedia | full | otro
  tecnico_asignado    TEXT,
  horas_estimadas     NUMERIC,
  observaciones_grls  TEXT,
  fecha_creacion      TIMESTAMPTZ,
  fecha_inicio        TIMESTAMPTZ,
  fecha_cierre        TIMESTAMPTZ
)

diagnostico_checklist (
  id UUID PRIMARY KEY,
  diagnostico_id  UUID FK → diagnosticos,
  seccion         INT,       -- 1..9
  item            TEXT,      -- nombre del ítem
  estado          TEXT,      -- ok | requiere_atencion | urgente | no_aplica
  observacion     TEXT
)

diagnostico_fotos (
  id UUID PRIMARY KEY,
  diagnostico_id  UUID FK → diagnosticos,
  seccion         INT,       -- 1..9 (no existe para sección 8)
  url             TEXT,      -- path en Supabase Storage
  descripcion     TEXT,
  orden           INT,
  created_at      TIMESTAMPTZ
)

diagnostico_repuestos (
  id UUID PRIMARY KEY,
  diagnostico_id  UUID FK → diagnosticos,
  nombre          TEXT,
  cantidad        NUMERIC,
  es_base         BOOL,      -- parte del paquete estándar o extra
  urgencia        TEXT,      -- necesario | recomendado | opcional
  observacion     TEXT
)
```

---

## 15. Módulo Presupuesto / Cotización

### 15.1 Principio de cálculo

El módulo usa una tabla tipo spreadsheet para que Torre/Encargado arme rápido la propuesta.

Reglas de negocio vigentes:
- SECCO ingresa el **costo de compra** del repuesto o servicio en `costo_unitario`.
- El sistema calcula automáticamente el precio cliente como `costo_unitario × 1.3`.
- Ese `+30%` es el margen comercial sobre repuestos/servicios.
- La **mano de obra no es un tipo seleccionable** dentro de la tabla principal.
- La mano de obra se cobra **una sola vez**, como fila fija al final del presupuesto.
- El descuento puede ser monto fijo (`$`) o porcentaje (`%`) y se aplica sobre el total final cliente.
- El IVA se calcula al 19% sobre el neto completo antes del descuento.
- El cargo por servicio siempre se aplica al cobro final.
- La vista interna muestra costo SECCO, utilidad y margen.
- La vista cliente muestra solo valores comerciales claros.
- **Solo el rol `admin` puede acceder a este módulo** (oculto en tabs, bloqueado en RLS).

### 15.2 Estructura interna actual

```sql
cotizaciones (
  id UUID PRIMARY KEY,
  numero_cotizacion      SERIAL UNIQUE,
  acta_id                UUID FK → actas,
  diagnostico_id         UUID FK → diagnosticos,
  orden_id               UUID FK → ordenes_trabajo,
  vehiculo_id            UUID FK → vehiculos,
  cliente_id             UUID FK → clientes,
  items                  JSONB,
  costo_total            NUMERIC,
  mano_obra_total        NUMERIC,
  neto_antes_descuento   NUMERIC,
  subtotal               NUMERIC,  -- neto final sin IVA
  descuento              NUMERIC,
  iva                    NUMERIC,
  total                  NUMERIC,  -- total cliente con IVA
  utilidad               NUMERIC,
  margen                 NUMERIC,
  vista_cliente          JSONB,
  status                 TEXT,     -- borrador | lista | enviada | aprobada | rechazada
  notas                  TEXT,
  notas_internas         TEXT,
  created_at             TIMESTAMPTZ,
  updated_at             TIMESTAMPTZ
)
```

---

## 16. Módulo Orden de Trabajo (OT)

### 16.1 Principio funcional

La OT nace desde una cotización aprobada. Torre de Control toma lo aprobado y lo transforma en una instrucción operativa para el técnico.

La OT separa claramente:
- **Repuestos**: materiales disponibles o necesarios.
- **Instrucciones de trabajo**: tareas que debe ejecutar el técnico.

El técnico no debe interpretar una cotización comercial: debe ver materiales y tareas en lenguaje operativo.

### 16.2 Estructura interna

```sql
ordenes_trabajo (
  id UUID PRIMARY KEY,
  numero_ot        SERIAL UNIQUE,
  cotizacion_id    UUID FK → cotizaciones,
  acta_id          UUID FK → actas,
  vehiculo_id      UUID FK → vehiculos,
  cliente_id       UUID FK → clientes,
  tecnico_nombre   TEXT,
  status           TEXT,  -- generada | asignada | en_proceso | finalizada | entregada
  items            JSONB, -- compatibilidad con cotización original
  repuestos        JSONB,
  instrucciones    JSONB,
  mano_obra        NUMERIC,
  observaciones    TEXT,
  notas_torre      TEXT,
  historial        JSONB,
  created_at       TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ
)
```

---

## 17. Lógica funcional — quién hace qué

| Acción | Quién | ¿Automático? |
|---|---|---|
| Iniciar acta (S1–S2) | Torre de Control | Manual |
| Guardar borrador S2→S3 | Sistema | Sí |
| Terminar acta (S3–S8) | Técnico | Manual |
| Crear diagnóstico vacío | Sistema | Sí — al cerrar acta |
| Nombrar diagnóstico con patente | Sistema | Sí |
| Completar checklist + fotos | Técnico | Manual |
| Sugerir tipo de mantención | Sistema | Sí (técnico confirma) |
| Listar repuestos detectados | Técnico | Manual |
| Construir presupuesto | Encargado de taller (admin) | Manual |
| Calcular utilidad y margen | Sistema | Sí |
| Generar vista cliente | Sistema | Sí |
| Marcar aprobado/rechazado | Encargado de taller (admin) | Manual |
| Crear OT desde cotización aprobada | Sistema | Sí |
| Separar repuestos e instrucciones | Sistema + Torre | Base automática, editable |
| Asignar técnico a OT | Torre de Control (admin) | Manual |
| Ejecutar instrucciones | Técnico | Manual |

---

## 18. Convenciones de código

- Sin TypeScript. JavaScript puro.
- Sin frameworks de UI externos (no MUI, no Radix). HTML nativo + clases CSS propias.
- Sin manejo de errores especulativo. Solo validar en bordes del sistema.
- Estilos inline para layout puntual; clases de `index.css` para componentes recurrentes.
- No agregar dependencias sin confirmar. Bundle actual: jsPDF + Supabase + JSZip.
- S1–S2 son Torre de Control. S3–S8 son Técnico. Respetar en labels y UX.
- Toda lógica de roles se centraliza en `useRol()` del `AuthContext`. No duplicar chequeos de rol en componentes.
- Toda lógica de BD va en `src/lib/supabase.js`. No llamar Supabase directo desde componentes.
- Las funciones `mi_rol()` y `mi_nombre()` en Supabase son SECURITY DEFINER. Nunca hacer `SELECT FROM perfiles` dentro de una policy RLS de `perfiles`.
- **Actualizar siempre `AGENTS.md`** cuando cambie arquitectura, flujo, tablas, funciones compartidas, reglas de negocio o navegación.

---

## 19. Onboarding — nuevo colaborador

### 19.1 Setup inicial (una sola vez)

```bash
# 1. Clonar el repo
git clone https://github.com/OWNER/secco-app.git
cd secco-app

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
# Edita .env y pega la URL y ANON KEY de Supabase
# → Las consigues en: tu proyecto Supabase > Settings > API

# 4. Ejecutar el schema y la migration en Supabase Dashboard > SQL Editor
#    Primero: supabase_schema.sql
#    Segundo: supabase_migration.sql

# 5. Crear el primer usuario admin
#    Supabase Dashboard > Authentication > Users > Add user
#    Luego en SQL Editor:
#    UPDATE perfiles SET rol = 'admin' WHERE id = '<UUID>';

# 6. Correr en desarrollo
npm run dev           # abre http://localhost:5173
```

> **Importante:** el `.env` **nunca** se sube al repo. Está en `.gitignore`.
> Pedir las credenciales directamente a Tomás (propietario del proyecto).

---

### 19.2 Flujo de trabajo Git (branching)

```
main        → código estable, deployable
dev         → integración continua
feature/*   → una feature o bugfix por branch

Ejemplo:
  git checkout dev
  git pull origin dev
  git checkout -b feature/modulo-diagnostico
  # ... trabajar ...
  git push origin feature/modulo-diagnostico
  # Crear Pull Request → dev
```

- **Nunca hacer push directo a `main`.**
- Los PR se revisan antes de mergear a `dev`.
- Cada semana o hito, `dev` → `main`.

---

### 19.3 Qué sabe cada agente de IA antes de trabajar

Este archivo (`AGENTS.md`) es el **único source of truth** del proyecto.
Cualquier agente (Claude Code, Codex, Cursor, Copilot, etc.) **debe leerlo completo** antes de tocar código.

Contexto mínimo para que un agente sea efectivo:
- Sección 2 → flujo general y regla Torre/Técnico
- Sección 3 → stack y dependencias permitidas
- Sección 4 → estructura de archivos
- Sección 6 → paleta de colores (regla absoluta)
- Sección 8 → sistema de roles (RBAC)
- Sección 18 → convenciones de código

Contexto para trabajar en un módulo específico:
- Sección 11 → Supabase (funciones existentes)
- Sección 14 → Diagnóstico
- Sección 15 → Presupuesto
- Sección 16 → Orden de Trabajo (OT)

---

### 19.4 Instrucciones específicas para Codex (OpenAI)

**Prompt de sistema recomendado al iniciar una tarea:**

```
Lee el archivo AGENTS.md completo antes de responder.
Este proyecto es una web app React 19 + Vite + Supabase para un taller mecánico chileno.
No uses TypeScript. No uses librerías de UI externas.
Respeta la paleta de colores definida en la sección 6.
Todas las funciones de base de datos van en src/lib/supabase.js.
El sistema de roles está en src/context/AuthContext.jsx — usa useRol() para condicionar acceso.
Antes de agregar cualquier dependencia, confirma con el usuario.
```

**Restricciones que Codex debe respetar en este proyecto:**

| Restricción | Motivo |
|---|---|
| Sin TypeScript | Proyecto definido en JS puro |
| Sin MUI / Radix / Chakra | Solo HTML nativo + clases propias en index.css |
| Sin nuevas dependencias npm sin aprobación | Bundle controlado |
| Estilos como `style={{}}` inline o clases de `index.css` | No Tailwind inline en JSX nuevo |
| Color `#a98225` (gold) como único acento | Paleta fija — no inventar colores nuevos |
| Toda BD en `src/lib/supabase.js` | No llamar Supabase directo desde componentes |
| Toda lógica de roles en `useRol()` | No duplicar chequeos de rol en componentes |
| No `SELECT FROM perfiles` en policies RLS | Causa recursión — usar `public.mi_rol()` |

**Flujo de estados que Codex debe conocer:**

```
Cotización:  borrador → lista → enviada → aprobada | rechazada
OT:          generada → asignada → en_proceso → finalizada → entregada
```

**Estructura de navegación actual (`App.jsx`):**

```
Root (requiere sesión activa — muestra LoginScreen si no hay usuario)
├── 'home'        → HomeScreen (tabs según rol:
│                    admin:          Borradores, Historial, Diagnóst., Presup., OTs, Técnico
│                    tecnico:        Borradores, Diagnóst., OTs, Técnico
│                    recepcionista:  Borradores, Historial, OTs)
├── 'form'        → ActaForm
├── 'diagnostico' → DiagnosticoForm
├── 'presupuesto' → PresupuestoForm  (solo admin — props: cotizacionInicial, onVolver, onAbrirOT)
├── 'ot'          → OTForm           (props: otInicial, onVolver)
└── 'tecnico'     → TecnicoScreen    (props: onVolver)
```

**Funciones disponibles en `supabase.js` (resumen):**

```js
// Actas
guardarBorrador(formData), actualizarActa(id, datos), cargarActaCompleta(actaId)
buscarBorradorPorPatente(patente), listarBorradoresRecientes(n), listarActasCerradas(n)

// Diagnósticos
crearDiagnostico(actaId, patente), cargarDiagnosticoCompleto(id), listarDiagnosticos(n)
listarDiagnosticosParaCotizar(n), buscarDiagnosticoPorPatente(patente)

// Cotizaciones
crearCotizacionDesdeDiagnostico(diagId), cargarCotizacionCompleta(id)
guardarCotizacion(id, datos), actualizarEstadoCotizacion(id, status), listarCotizaciones(n)
aprobarCotizacion(cotizacionId), rechazarCotizacion(cotizacionId, motivo)

// OTs
cargarOTCompleta(otId), listarOTs(n), listarOTsPorTecnico(nombre)
asignarTecnico(otId, nombre), avanzarEstadoOT(otId, status, nota), editarOT(otId, cambios)
listarTecnicos(), estructurarOTDesdeItems(items)
```

---

## 20. Comandos útiles

```bash
cd secco-app          # SIEMPRE entrar a la subcarpeta antes de correr npm
npm run dev           # desarrollo en localhost:5173
npm run build         # verificar que compila sin errores
npm run preview       # previsualizar build
```

---

## 21. Backlog

- Integrar soft lock UI en PresupuestoForm y OTForm (infraestructura lista en `softlock.js`)
- Notificaciones push al Técnico cuando Torre crea borrador o asigna OT
- Catálogo de repuestos con precios de referencia (autocompletar cotización)
- Panel de administración web (métricas, historial completo)
- PDF de OT para el técnico
- Firma digital del cliente al aprobar cotización (vía link o QR)
- Detección de conflictos de versión por `updated_at` en formularios concurrentes
