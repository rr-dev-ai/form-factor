import type { Locale } from './site';

export type Localized = Record<Locale, string>;

export interface Industry {
  slug: string;
  name: Localized;
}

export interface Tag {
  slug: string;
  name: Localized;
  industry?: string;
}

export const industries: Industry[] = [
  { slug: 'banking', name: { zh: '银行业', en: 'Banking', es: 'Banca' } },
  { slug: 'telecom', name: { zh: '电信业', en: 'Telecom', es: 'Telecomunicaciones' } },
  { slug: 'identity', name: { zh: '身份与证照', en: 'Identity', es: 'Identidad' } },
];

export const tags: Tag[] = [
  { slug: 'acquiring', name: { zh: '收单', en: 'Acquiring', es: 'Adquirencia' }, industry: 'banking' },
  { slug: 'issuing', name: { zh: '发卡', en: 'Issuing', es: 'Emisión' }, industry: 'banking' },
  { slug: 'softpos', name: { zh: '软 POS', en: 'SoftPOS', es: 'SoftPOS' }, industry: 'banking' },
  { slug: 'payment-gateway', name: { zh: '支付网关', en: 'Payment gateway', es: 'Pasarela de pago' }, industry: 'banking' },
  { slug: 'digital-wallet', name: { zh: '数字钱包', en: 'Digital wallet', es: 'Monedero digital' }, industry: 'banking' },
  { slug: 'fraud', name: { zh: '风控与反欺诈', en: 'Fraud & risk', es: 'Fraude y riesgo' }, industry: 'banking' },
  { slug: 'scheme-rules', name: { zh: '卡组织规则', en: 'Scheme rules', es: 'Reglas de esquema' }, industry: 'banking' },
  { slug: 'clearing', name: { zh: '清算与结算', en: 'Clearing', es: 'Compensación' }, industry: 'banking' },
  { slug: 'tokenization', name: { zh: '令牌化', en: 'Tokenization', es: 'Tokenización' }, industry: 'banking' },
  { slug: 'esim', name: { zh: 'eSIM', en: 'eSIM', es: 'eSIM' }, industry: 'telecom' },
  { slug: 'rsp', name: { zh: 'RSP', en: 'RSP', es: 'RSP' }, industry: 'telecom' },
  { slug: '5g', name: { zh: '5G', en: '5G', es: '5G' }, industry: 'telecom' },
  { slug: 'roaming', name: { zh: '漫游', en: 'Roaming', es: 'Itinerancia' }, industry: 'telecom' },
  { slug: 'mvno', name: { zh: '虚拟运营商', en: 'MVNO', es: 'OMV' }, industry: 'telecom' },
  { slug: 'isim', name: { zh: 'iSIM', en: 'iSIM', es: 'iSIM' }, industry: 'telecom' },
  { slug: 'sim-registration', name: { zh: '实名注册', en: 'SIM registration', es: 'Registro de SIM' }, industry: 'telecom' },
  { slug: 'passport', name: { zh: '护照', en: 'Passport', es: 'Pasaporte' }, industry: 'identity' },
  { slug: 'national-id', name: { zh: '身份证', en: 'National ID', es: 'Documento nacional' }, industry: 'identity' },
  { slug: 'mobile-id', name: { zh: '移动证件', en: 'Mobile ID', es: 'Identidad móvil' }, industry: 'identity' },
  { slug: 'biometrics', name: { zh: '生物识别', en: 'Biometrics', es: 'Biometría' }, industry: 'identity' },
  { slug: 'liveness', name: { zh: '活体检测', en: 'Liveness', es: 'Prueba de vida' }, industry: 'identity' },
  { slug: 'pki', name: { zh: 'PKI 与证书', en: 'PKI', es: 'PKI' }, industry: 'identity' },
  { slug: 'secure-chip', name: { zh: '安全芯片', en: 'Secure chip', es: 'Chip seguro' }, industry: 'identity' },
  { slug: 'verification', name: { zh: '核验与受理', en: 'Verification', es: 'Verificación' }, industry: 'identity' },
];

export function industryName(slug: string, locale: Locale): string {
  return industries.find((i) => i.slug === slug)?.name[locale] ?? slug;
}

export function tagName(slug: string, locale: Locale): string {
  return tags.find((t) => t.slug === slug)?.name[locale] ?? slug;
}
