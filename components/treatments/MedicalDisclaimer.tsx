export function MedicalDisclaimer() {
  return (
    <div
      className="rounded-[16px] px-6 py-5 max-w-[720px] mx-auto w-full"
      style={{
        background: 'rgba(196,163,90,0.03)',
        border: '1px solid rgba(26,26,46,0.06)',
      }}
    >
      <p className="font-body text-[11px] leading-[1.8] text-center" style={{ color: 'var(--color-text-muted)' }}>
        Bu içerik yalnızca bilgilendirme amaçlıdır ve tıbbi tavsiye niteliği taşımaz.
        Teşhis ve tedavi için mutlaka uzman bir hekime başvurunuz.
        Her bireyin durumu farklıdır; tedavi planı kişiye özel klinik değerlendirme sonrasında oluşturulmalıdır.
      </p>
    </div>
  )
}
