'use client';
import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SCENT_PREFERENCES, SEASON_PREFERENCES, OCCASION_PREFERENCES, CONCENTRATION_PREFERENCES, type CustomerAccount, type SavedCustomerAddress, type CustomerOrderSummary, type CustomerProfileInput } from '@diyar/domain';
import { CUSTOMER_ACCOUNT, CUSTOMER_OPTIONS, governorateOptions, formatPrice, type Locale } from '@diyar/i18n';
import { primarySurface } from '@/features/shell/primary-surface';
import { localeHref } from '@/core/href';
import { saveCustomerProfile, addCustomerAddress, removeCustomerAddress, signOutCustomer, signOutCustomerEverywhere } from './actions';
import { budgetPiastres, budgetDisplay, bottleSizes } from './form-values';
export type AccountTab = 'profile' | 'addresses' | 'orders' | 'privacy';
const control = 'mt-2 min-h-touch w-full border border-line bg-ground px-3 py-2 text-body text-ink';
const button = primarySurface + ' px-6';
export function CustomerAccountView({ locale, profile, tab, addresses, orders, next, children }: {
    locale: Locale;
    profile: CustomerAccount;
    tab: AccountTab;
    addresses: SavedCustomerAddress[];
    orders: CustomerOrderSummary[];
    next: boolean;
    children?: React.ReactNode;
}) {
    const c = CUSTOMER_ACCOUNT[locale], options = CUSTOMER_OPTIONS[locale], router = useRouter(), busy = useRef(false);
    const [pending, setPending] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
    async function run(work: () => Promise<{
        ok: boolean;
    }>, after?: () => void) { if (busy.current)
        return; busy.current = true; setPending(true); setError(''); setMessage(''); try {
        const result = await work();
        if (result.ok) {
            setMessage(c.saved);
            after?.();
            router.refresh();
        }
        else
            setError(c.failed);
    }
    catch {
        setError(c.failed);
    }
    finally {
        busy.current = false;
        setPending(false);
    } }
    function field(name: string, title: string, value: string | number, type = 'text', required = false) { return <label className="block text-body text-ink2"><span>{title}{required ? ' *' : ''}</span><input name={name} type={type} defaultValue={value} required={required} className={control} maxLength={name==='fullName'?80:name==='email'?254:name==='notes'?1500:type==='text'?160:undefined} minLength={name==='fullName'?2:undefined} {...(type === 'date' ? { min: '1900-01-01', max: new Date().toISOString().slice(0, 10) } : {})} {...(type === 'number' ? { min: 0, step: '0.01' } : {})}/></label>; }
    function choices(name: string, title: string, values: readonly string[], selected: readonly string[]) { return <fieldset className="mt-5"><legend className="text-body text-ink2">{title}</legend><div className="mt-2 flex flex-wrap gap-3">{values.map(v => <label key={v} className="flex min-h-touch items-center gap-2 border border-line px-3 text-body"><input type="checkbox" name={name} value={v} defaultChecked={selected.includes(v)}/>{options[v as keyof typeof options]}</label>)}</div></fieldset>; }
    async function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const f = new FormData(event.currentTarget); try {
        const min = budgetPiastres(String(f.get('min') ?? '')), max = budgetPiastres(String(f.get('max') ?? ''));
        if (min !== null && max !== null && min > max)
            throw Error();
        const input: CustomerProfileInput = { fullName: String(f.get('fullName')), email: String(f.get('email') ?? '').trim() || null, dateOfBirth: String(f.get('dateOfBirth')), gender: String(f.get('gender')) as CustomerProfileInput['gender'], families: f.getAll('families').map(String), notes: String(f.get('notes') ?? '').split(/[,،]/).map(x => x.trim()).filter(Boolean), occasions: f.getAll('occasions').map(String), seasons: f.getAll('seasons').map(String), concentrations: f.getAll('concentrations').map(String), bottleSizes: bottleSizes(String(f.get('sizes') ?? '')), budgetMinPiastres: min, budgetMaxPiastres: max, personalizationConsent: f.has('personalization'), marketingConsent: f.has('marketing') };
        await run(() => saveCustomerProfile(input), () => { if (next)
            router.push(localeHref(locale, '/checkout')); });
    }
    catch {
        setError(c.budgetError);
    } }
    async function add(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget, f = new FormData(form), get = (key: string) => String(f.get(key) ?? '').trim(); await run(() => addCustomerAddress({ label: get('label') || null, governorate: get('governorate'), city: get('city'), area: get('area'), street: get('street'), building: get('building'), floor: get('floor') || null, apartment: get('apartment') || null, landmark: get('landmark') || null, contactPhone: profile.phone, isDefault: f.has('default') }), () => form.reset()); }
    return <div className="grid gap-7 lg:grid-cols-[220px_1fr]"><aside><nav aria-label={c.title} className="flex flex-wrap gap-2 lg:flex-col">{(['profile', 'addresses', 'orders', 'privacy'] as const).map(key => <Link key={key} href={{ pathname: localeHref(locale, '/account'), query: { tab: key, ...(next ? { next: 'checkout' } : {}) } }} aria-current={tab === key ? 'page' : undefined} className={'min-h-touch border px-4 py-3 text-body ' + (tab === key ? 'border-accent text-accent' : 'border-line text-ink2')}>{c[key]}</Link>)}<form action={signOutCustomer}><button className="min-h-touch px-4 text-body text-ink2">{c.signOut}</button></form></nav></aside><section className="min-w-0 border border-line bg-raised p-5 lg:p-7"><h2 className="font-display text-h3">{c[tab]}</h2>{message && <p role="status" className="mt-4 text-body text-accent">{message}</p>}{error && <p role="alert" className="mt-4 text-body text-danger">{error}</p>}
 {tab === 'profile' && <form onSubmit={save} className="mt-5 space-y-5"><p className="text-body text-ink2">{c.verified}: <bdi className="tnum">{profile.phone}</bdi></p>{!profile.profileComplete && <p className="border border-line p-4 text-body text-ink2">{c.required}</p>}<div className="grid gap-5 lg:grid-cols-2">{field('fullName', c.name, profile.fullName, 'text', true)}{field('email', c.email, profile.email ?? '', 'email')}{field('dateOfBirth', c.dob, profile.dateOfBirth, 'date', true)}<label className="block text-body text-ink2">{c.gender} *<select name="gender" required defaultValue={profile.gender ?? ''} className={control}><option value="" disabled>{c.select}</option>{(['female', 'male', 'other'] as const).map(v => <option key={v} value={v}>{c[v]}</option>)}</select></label></div><p className="text-small text-ink2">{c.emailHelp}</p><h3 className="border-t border-line pt-5 font-display text-h4">{c.optional}</h3>{choices('families', c.families, SCENT_PREFERENCES, profile.families)}{field('notes', c.notes, profile.notes.join(', '))}<p className="text-small text-ink2">{c.notesHelp}</p>{choices('occasions', c.occasions, OCCASION_PREFERENCES, profile.occasions)}{choices('seasons', c.seasons, SEASON_PREFERENCES, profile.seasons)}{choices('concentrations', c.concentrations, CONCENTRATION_PREFERENCES, profile.concentrations)}{field('sizes', c.sizes, profile.bottleSizes.join(', '))}<div className="grid gap-5 lg:grid-cols-2">{field('min', c.budgetMin, budgetDisplay(profile.budgetMinPiastres), 'number')}{field('max', c.budgetMax, budgetDisplay(profile.budgetMaxPiastres), 'number')}</div><fieldset className="space-y-3 border-t border-line pt-5"><legend className="sr-only">{c.privacy}</legend><label className="flex min-h-touch items-center gap-3 text-body"><input name="personalization" type="checkbox" defaultChecked={profile.personalizationConsent}/>{c.personalization}</label><label className="flex min-h-touch items-center gap-3 text-body"><input name="marketing" type="checkbox" defaultChecked={profile.marketingConsent}/>{c.marketing}</label><p className="text-small text-ink2">{c.consentHelp}</p></fieldset><button className={button} disabled={pending}>{next ? c.continue : c.save}</button></form>}
 {tab === 'addresses' && <><div className="my-5 grid gap-4 lg:grid-cols-2">{addresses.length === 0 ? <p className="text-body text-ink2">{c.emptyAddresses}</p> : addresses.map(a => <article key={a.id} className="border border-line p-4"><h3 className="font-medium">{a.label ?? a.city}{a.isDefault ? ' · ' + c.default : ''}</h3><p className="mt-2 text-body text-ink2">{[a.street, a.building, a.floor, a.apartment, a.area, a.city, a.landmark].filter(Boolean).join(' · ')}</p><button type="button" className="mt-2 min-h-touch text-danger underline" disabled={pending} onClick={() => void run(() => removeCustomerAddress(a.id))}>{c.remove}</button></article>)}</div><form onSubmit={add} className="grid gap-5 border-t border-line pt-5 lg:grid-cols-2">{field('label', c.label, '', 'text', true)}<label className="block text-body text-ink2">{c.governorate}<select name="governorate" className={control}>{governorateOptions(locale).map(g => <option key={g.value} value={g.value}>{g.label}</option>)}</select></label>{field('city', c.city, '', 'text', true)}{field('area', c.area, '', 'text', true)}{field('street', c.street, '', 'text', true)}{field('building', c.building, '', 'text', true)}{field('floor', c.floor, '')}{field('apartment', c.apartment, '')}{field('landmark', c.landmark, '')}<label className="flex min-h-touch items-center gap-3 text-body"><input type="checkbox" name="default"/>{c.default}</label><button className={button} disabled={pending}>{c.addAddress}</button></form></>}
 {tab === 'orders' && <><p className="mt-3 text-small text-ink2">{c.recentOrders}</p>{orders.length === 0 ? <p className="mt-5 text-body">{c.emptyOrders}</p> : <div className="mt-5 overflow-x-auto"><table className="w-full text-start text-body"><thead><tr>{[c.reference, c.date, c.total, c.details].map(v => <th key={v} scope="col" className="border-b border-line p-3 text-start">{v}</th>)}</tr></thead><tbody>{orders.map(o => <tr key={o.reference}><td className="border-b border-line p-3"><bdi>{o.reference}</bdi></td><td className="border-b border-line p-3">{new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', { timeZone: 'Africa/Cairo' }).format(new Date(o.placedAt))}</td><td className="border-b border-line p-3 tnum">{formatPrice(o.totalPiastres)} EGP</td><td className="border-b border-line p-3"><Link className="inline-flex min-h-touch items-center text-accent underline" href={{ pathname: localeHref(locale, '/account'), query: { tab: 'orders', ref: o.reference } }}>{c.details}</Link></td></tr>)}</tbody></table></div>}<div className="mt-7">{children}</div></>}
 {tab === 'privacy' && <div className="mt-5 space-y-5"><p className="text-body leading-relaxed text-ink2">{c.privacyHelp}</p>{[c.export, c.deletion].map(subject => <Link key={subject} className="flex min-h-touch items-center border border-line px-4 text-body text-accent" href={{ pathname: localeHref(locale, '/support'), query: { subject,category:'privacy' } }}>{subject} ↗</Link>)}<form action={signOutCustomerEverywhere}><button className="min-h-touch border border-danger px-5 text-body text-danger">{c.signOutAll}</button></form></div>}
 </section></div>;
}
