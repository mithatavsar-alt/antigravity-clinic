import type { Metadata } from 'next'
import { TreatmentHero } from '@/components/treatments/TreatmentHero'
import { TreatmentSection } from '@/components/treatments/TreatmentSection'
import { TreatmentLayout } from '@/components/treatments/TreatmentLayout'

export const metadata: Metadata = {
  title: 'Mezoterapi Nedir? — Antigravity Clinic',
  description: 'Mezoterapi uygulaması hakkında bilgilendirme: cilt yenileme, vitamin kokteylleri, uygulama alanları ve etkileri. Dr. Müjde Ocak kliniğinde kişiye özel cilt bakım çözümleri.',
}

const RELATED = [
  { label: 'Botoks', href: '/treatments/botox' },
  { label: 'Dolgu Uygulamaları', href: '/treatments/filler' },
]

export default function MesotherapyPage() {
  return (
    <TreatmentLayout relatedLinks={RELATED}>
      <TreatmentHero
        label="Tedavi Bilgilendirme"
        title="Mezoterapi Nedir?"
        subtitle="Cilt altına mikroenjeksiyon yöntemiyle uygulanan vitamin, mineral ve amino asit kokteylleri ile cildin içten dışa yenilenmesini sağlayan destekleyici bir estetik prosedürdür."
      />

      <TreatmentSection heading="Mezoterapi ne işe yarar?" index={0}>
        <p>
          Mezoterapi, cildin orta tabakasına (mezoderm) uygulanan mikroenjeksiyonlar aracılığıyla
          besleyici maddelerin doğrudan hedef bölgeye ulaşmasını sağlar. Kokteyl içeriği
          genellikle hyalüronik asit, vitaminler (C, E, B kompleksi), mineraller, amino asitler
          ve antioksidanlardan oluşur.
        </p>
        <p>
          Bu besleyici karışım cildin kendi yenilenme sürecini destekler, kollajen üretimini
          uyarır ve hücre metabolizmasını hızlandırır. Sonuç olarak cilt daha parlak, nemli
          ve canlı bir görünüm kazanır.
        </p>
      </TreatmentSection>

      <TreatmentSection heading="Kimlere uygundur?" index={1}>
        <p>
          Mezoterapi, cilt kalitesini iyileştirmek isteyen hemen hemen herkese uygulanabilir.
          Özellikle aşağıdaki durumlar için tercih edilir:
        </p>
        <ul className="list-none flex flex-col gap-2 pl-0">
          {[
            ['Donuk ve yorgun görünümlü cilt', 'Mevsimsel değişimler veya stres kaynaklı cilt matlaşması'],
            ['Nem kaybı ve kuruluk', 'Cildin derinlemesine nemlendirilerek elastikiyetinin artırılması'],
            ['İnce çizgiler', 'Erken dönem yaşlanma belirtilerinin geciktirilmesi'],
            ['Leke ve ton eşitsizliği', 'Melanin düzenleyici ve aydınlatıcı aktiflerle cilt tonunun eşitlenmesi'],
          ].map(([title, desc]) => (
            <li key={title} className="flex gap-3 items-start">
              <span className="w-1.5 h-1.5 rounded-full mt-2.5 flex-shrink-0" style={{ background: 'rgba(214,185,140,0.35)' }} />
              <span><strong className="text-[rgba(248,246,242,0.65)] font-medium">{title}</strong> — {desc}</span>
            </li>
          ))}
        </ul>
        <p>
          Hamilelik, emzirme döneminde, aktif cilt enfeksiyonu olan veya otoimmün hastalık
          tedavisi gören kişilerde uygulama önerilmez.
        </p>
      </TreatmentSection>

      <TreatmentSection heading="Cilt kalitesine etkisi" index={2}>
        <p>
          Mezoterapi&apos;nin ciltte sağladığı temel iyileşmeler:
        </p>
        <ul className="list-none flex flex-col gap-2 pl-0">
          {[
            ['Nem ve dolgunluk', 'Hyalüronik asit ile derin hidrasyon sağlanır'],
            ['Parlaklık', 'Vitamin C ve antioksidanlar cilde ışıltılı bir görünüm kazandırır'],
            ['Elastikiyet', 'Kollajen ve elastin üretimi desteklenerek cilt sıkılaştırılır'],
            ['Pürüzsüzlük', 'İnce gözenekler küçülür, cilt dokusu düzleşir'],
          ].map(([title, desc]) => (
            <li key={title} className="flex gap-3 items-start">
              <span className="w-1.5 h-1.5 rounded-full mt-2.5 flex-shrink-0" style={{ background: 'rgba(74,227,167,0.40)' }} />
              <span><strong className="text-[rgba(248,246,242,0.65)] font-medium">{title}</strong> — {desc}</span>
            </li>
          ))}
        </ul>
      </TreatmentSection>

      <TreatmentSection heading="Uygulama süreci" index={3}>
        <p>
          Bir mezoterapi seansı yaklaşık 20–30 dakika sürer. Uygulama öncesinde bölgeye
          topikal anestezik krem uygulanarak konfor sağlanır. İnce uçlu iğneler veya mezogun
          cihazı ile kokteyl cildin altına enjekte edilir.
        </p>
        <p>
          Optimum sonuçlar için genellikle 3 ila 6 seanslık bir kür önerilir. Seanslar
          arasında 2–4 hafta beklenir. İşlem sonrası hafif kızarıklık veya küçük noktasal
          izler oluşabilir; bunlar 24–48 saat içinde kaybolur.
        </p>
      </TreatmentSection>

      <TreatmentSection heading="Sonuçlar ne zaman görülür?" index={4}>
        <p>
          İlk seanstan sonra ciltte bir parlaklık ve nem artışı fark edilebilir. Ancak gerçek
          yapısal iyileşme (kollajen yenilenmesi, gözenek küçülmesi, sıkılaşma) kür tamamlandıktan
          sonra belirginleşir.
        </p>
        <p>
          Etki süresi kişinin yaşam tarzına, cilt bakım rutinine ve genel sağlık durumuna
          bağlı olarak 4 ila 6 ay sürer. Düzenli bakım seansları ile sonuçlar daha uzun süre
          korunabilir.
        </p>
      </TreatmentSection>
    </TreatmentLayout>
  )
}
