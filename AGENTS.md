# Cat Breed Classifier - AI Coding Agent Guide

## Agent skills

### Issue tracker

Issues and specs are tracked in GitHub Issues for `bethezank/onnx-classifier`. See `docs/agents/issue-tracker.md`.

### Domain docs

This is a single-context repo. Read `CONTEXT.md` and relevant ADRs before exploring. See `docs/agents/domain.md`.

## Project Overview

This is a **web-based AI application** that classifies 10 cat breeds using deep learning models running directly in the browser. Users can upload cat images and get predictions from fine-tuned GoogleNet or SqueezeNet models using ONNX Runtime Web.

- **Live Demo:** https://btz-image-classify.web.app/
- **Matlab Reference:** https://www.mathworks.com/matlabcentral/fileexchange/182202-cat-breed-classifier-a-web-based-deep-learning-application
- **Educational Project:** Department of Computer and Information Sciences, KMUTNB

### Key Features
- **Built-in Models:** Pre-trained GoogleNet and ResNet-50 models for cat breed classification
- **Custom Model Support:** Users can upload their own ONNX models and class label files
- **Client-side Inference:** All ML inference runs in the browser using ONNX Runtime Web
- **Bilingual UI:** Thai and English mixed interface (primary: Thai)
- **Dark/Light Mode:** Theme switching support

---

## Technology Stack

| Category | Technology |
|----------|------------|
| **Framework** | React 18.3 + TypeScript 5.8 |
| **Build Tool** | Vite 5.4 with SWC plugin |
| **UI Components** | shadcn/ui + Radix UI primitives |
| **Styling** | Tailwind CSS 3.4 |
| **ML Runtime** | ONNX Runtime Web 1.23 |
| **State Management** | TanStack Query (React Query) |
| **Routing** | React Router DOM 6 |
| **Forms/Validation** | React Hook Form + Zod |
| **Icons** | Lucide React + Material Symbols Rounded |
| **Notifications** | Sonner + Custom Toast |

---

## Project Structure

```
├── src/
│   ├── components/
│   │   ├── ui/              # shadcn/ui components (50+ Radix-based components)
│   │   ├── BuiltInModels.tsx
│   │   ├── CustomModelCard.tsx
│   │   ├── FileUploadCard.tsx
│   │   ├── HeroCard.tsx     # Main model selection & prediction UI
│   │   ├── Navbar.tsx       # Header with dark mode toggle
│   │   ├── Ourteam.tsx      # Team credits section
│   │   └── PredictionResult.tsx
│   ├── hooks/
│   │   ├── use-mobile.tsx
│   │   └── use-toast.ts     # Toast notification hook
│   ├── lib/
│   │   └── utils.ts         # cn() helper for Tailwind classes
│   ├── pages/
│   │   ├── Index.tsx        # Main application page
│   │   └── NotFound.tsx     # 404 page
│   ├── utils/
│   │   └── onnxInference.ts # ONNX model loading & inference utilities
│   ├── App.tsx              # Root component with providers
│   ├── main.tsx             # React entry point
│   └── index.css            # Global styles + CSS variables
├── public/
│   ├── models/              # ONNX model files
│   │   ├── trainedGoogleNet-cat.onnx
│   │   └── trainedSqueezeNet-cat.onnx
│   ├── classes/             # Class label files
│   │   └── classNames-cat.json
│   ├── *.wasm               # ONNX Runtime WASM binaries
│   ├── lab-bg.webp          # Background image
│   └── logo.png
├── components.json          # shadcn/ui configuration
├── tailwind.config.ts       # Tailwind + theme configuration
├── vite.config.ts           # Vite + ONNX WASM copy plugin
└── tsconfig.json            # TypeScript configuration (relaxed strictness)
```

---

## Build and Development Commands

```bash
# Install dependencies
npm install

# Start development server (http://localhost:8080)
npm run dev

# Build for production (outputs to /dist)
npm run build

# Build for development mode
npm run build:dev

# Preview production build
npm run preview

# Run ESLint
npm run lint
```

---

## Key Configuration Details

### TypeScript Configuration (tsconfig.app.json)
- **Strict mode:** DISABLED (`strict: false`)
- **Unused locals/parameters:** Not enforced
- **Implicit any:** Allowed
- **Path alias:** `@/*` maps to `./src/*`

### Vite Configuration (vite.config.ts)
- **Host:** `::` (IPv6 compatible)
- **Port:** 8080
- **Special Plugins:**
  - `vite-plugin-static-copy`: Copies ONNX WASM files from `node_modules/onnxruntime-web/dist/` to build output
  - `lovable-tagger`: Development-only component tagging

### ONNX Runtime Setup
The application requires ONNX Runtime Web WASM files to be served at the root:
- `ort-wasm-simd-threaded.wasm`
- `ort-wasm-simd-threaded.mjs`
- `ort-wasm-simd-threaded.jsep.wasm` (WebGPU support)
- `ort-wasm-simd-threaded.asyncify.wasm`

These are automatically copied during build via `vite-plugin-static-copy`.

---

## Code Style Guidelines

### Component Structure
- Use functional components with TypeScript interfaces for props
- Use `@/` path alias for imports from `src/`
- shadcn/ui components use `class-variance-authority` (cva) for variants

### Styling Conventions
- **Primary styling:** Tailwind CSS utility classes
- **Custom utilities:** Defined in `src/index.css` with `@layer utilities`
- **Glass card effect:** `.glass-card` class for frosted glass UI
- **Theme colors:** CSS variables in HSL format (see `:root` in index.css)
- **Custom primary color:** `#6366f1` (indigo-500)

### Naming Conventions
- Components: PascalCase (e.g., `HeroCard.tsx`)
- Hooks: camelCase with `use` prefix (e.g., `use-toast.ts`)
- Utilities: camelCase (e.g., `onnxInference.ts`)

### Comment Style
- English comments for code explanation
- Thai language used in UI strings
- Thai comments appear in some ML-related code (e.g., image preprocessing)

---

## ONNX Inference Architecture

### Model Input Requirements
- **Image size:** 224x224 pixels
- **Format:** NCHW (Batch, Channel, Height, Width)
- **Preprocessing:** Mean subtraction per channel
  - R: 113.84185
  - G: 107.20119
  - B: 100.25863

### Key Functions (src/utils/onnxInference.ts)
```typescript
loadONNXModel(modelFile: File)     // Load ONNX model from File
loadClassLabels(classFile: File)   // Parse JSON class labels
preprocessImage(imageFile, 224)    // Resize and normalize image
runInference(session, input, labels, topK=5)  // Run prediction
```

### WASM Path Configuration
```typescript
ort.env.wasm.wasmPaths = '/';
ort.env.logLevel = 'fatal';  // Suppress ONNX warnings
```

---

## UI Component Patterns

### shadcn/ui Components
Located in `src/components/ui/`, these follow a standard pattern:
- Built on Radix UI primitives
- Use `cva` for variant management
- Support `className` prop merging via `cn()` utility
- Support `asChild` prop for composition

### Custom Components
- **HeroCard:** Main interface with model selection, image upload, and predictions
- **CustomModelCard:** Interface for user-uploaded ONNX models
- **FileUploadCard:** Reusable file upload with preview capability

### Toast Notifications
- Use `useToast()` hook from `@/hooks/use-toast`
- Supports success, error, and info variants
- Limit: 1 toast at a time (`TOAST_LIMIT = 1`)

---

## Testing Strategy

**No automated tests are currently configured.** The project relies on:
- Manual testing via browser
- ESLint for code quality
- TypeScript for type checking (with relaxed settings)

To add testing, consider:
- Vitest for unit testing
- Playwright or Cypress for E2E testing

---

## Deployment

### Current Deployment
- **Platform:** Firebase Hosting
- **URL:** https://btz-image-classify.web.app/

### Build Output
- Static files generated in `/dist`
- All ONNX WASM files included in root
- Optimized for client-side only deployment

---

## Security Considerations

1. **Client-side only:** No server-side code; all inference happens in browser
2. **File uploads:** User-uploaded files are processed locally, never sent to server
3. **ONNX models:** Pre-trained models are public assets in `/public/models`
4. **CORS:** WASM files must be served with correct MIME types (handled by Vite copy plugin)

---

## Common Development Tasks

### Adding a New shadcn/ui Component
```bash
npx shadcn add <component-name>
```
This installs the component to `src/components/ui/`

### Updating ONNX Models
Place model files in `/public/models/`:
- `cat-10breeds-net-google.onnx` - GoogleNet model
- `cat-10breeds-net-resnet50.onnx` - ResNet-50 model

### Adding New Class Labels
Update `/public/classes/classNames-cat.json` with array of class names

### Customizing Theme Colors
1. Edit CSS variables in `src/index.css` `:root`
2. Update `tailwind.config.ts` theme extension if needed
3. Primary color override is in tailwind config: `primary: { DEFAULT: "#6366f1" }`

---

## Troubleshooting

### ONNX WASM Loading Issues
- Ensure WASM files are in the build output root
- Check `vite-plugin-static-copy` is configured correctly
- Verify `ort.env.wasm.wasmPaths = '/'` is set

### TypeScript Errors
- Project uses relaxed TypeScript settings
- Strict mode is disabled intentionally
- `@typescript-eslint/no-unused-vars` is off

### Build Failures
- Check Node.js version compatibility (project uses ES modules)
- Ensure `type: "module"` in package.json
- Clear `node_modules` and reinstall if issues persist
