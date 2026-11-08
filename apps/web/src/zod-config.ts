import { z } from 'zod';

// The page's content security policy forbids code generation, and zod would otherwise probe
// for it and trigger a blocked eval. Zod reads this setting as each schema is created, so
// this module must be imported before anything that defines a schema.
z.config({ jitless: true });
