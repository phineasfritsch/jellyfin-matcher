import type { Metadata } from 'next';
import { GuideLogin } from '../../src/ui/GuideLogin';
import { t } from '../../src/ui/strings';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: t('guideLogin.metadata') };
export default function GuideLoginPage() { return <GuideLogin />; }
