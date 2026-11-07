import type { ReactElement } from 'react';
import type { LicenseStatus } from '../types';
import { statusLabels } from '../utils/format';

export const StatusBadge = ({ status }: { status: LicenseStatus }): ReactElement =>
  <span className={`status-badge status-badge--${status}`}>{statusLabels[status]}</span>;
