import { handleLicensingRequest } from '../_shared/licensing.ts';

Deno.serve((request) => handleLicensingRequest(request, 'trial'));
