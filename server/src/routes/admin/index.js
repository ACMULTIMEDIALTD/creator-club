import { Router } from 'express';
import { requireRole } from '../../lib/auth.js';
import overview from './overview.js';
import creators from './creators.js';
import brands from './brands.js';
import campaigns from './campaigns.js';
import applications from './applications.js';
import uploads from './uploads.js';
import payments from './payments.js';
import admins from './admins.js';

const router = Router();
router.use(requireRole('admin'));
router.use('/overview', overview);
router.use('/creators', creators);
router.use('/brands', brands);
router.use('/campaigns', campaigns);
router.use('/applications', applications);
router.use('/images', uploads);
router.use('/payments', payments);
router.use('/admins', admins);

export default router;
