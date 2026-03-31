export function MedicalDisclaimer() {
  return (
    <div
      className="rounded-[16px] px-6 py-5 max-w-[720px] mx-auto w-full"
      style={{
        background: 'rgba(214,185,140,0.02)',
        border: '1px solid rgba(214,185,140,0.06)',
      }}
    >
      <p className="font-body text-[11px] text-[rgba(248,246,242,0.28)] leading-[1.8] text-center">
        Bu içerik yalnızca bilgilendirme amaçlıdır ve tıbbi tavsiye niteliği taşımaz.
        Teşhis ve tedavi için mutlaka uzman bir hekime başvurunuz.
        Her bireyin durumu farklıdır; tedavi planı kişiye özel klinik değerlendirme sonrasında oluşturulmalıdır.
      </p>
    </div>
  )
}
