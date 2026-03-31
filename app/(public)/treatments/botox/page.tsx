import type { Metadata } from 'next'
import { TreatmentHero } from '@/components/treatments/TreatmentHero'
import { TreatmentSection } from '@/components/treatments/TreatmentSection'
import { TreatmentLayout } from '@/components/treatments/TreatmentLayout'

export const metadata: Metadata = {
  title: 'Botoks Nedir? — Antigravity Clinic',
  description: 'Botoks uygulaması hakkında bilmeniz gerekenler: etki mekanizması, uygulama bölgeleri, etki süresi ve olası riskler. Dr. Müjde Ocak kliniğinde güvenli estetik çözümler.',
}

const RELATED = [
  { label: 'Dolgu Uygulamaları', href: '/treatments/filler' },
  { label: 'Mezoterapi', href: '/treatments/mesotherapy' },
]

export default function BotoxPage() {
  return (
    <TreatmentLayout relatedLinks={RELATED}>
      <TreatmentHero
        label="Tedavi Bilgilendirme"
        title="Botoks Nedir?"
        subtitle="Mimik kaslarını geçici olarak dinlendirerek kırışıklıkların yumuşatılmasını sağlayan, dünyada en yaygın uygulanan minimal invaziv estetik prosedürlerden biridir."
      />

      <TreatmentSection heading="Botoks nasıl etki eder?" index={0}>
        <p>
          Botulinum toksin (kısaca botoks), kas ile sinir arasındaki iletişimi geçici olarak azaltarak hedef
          kaslarda kontrollü bir gevşeme sağlar. Bu etki sayesinde yüz ifadesi sırasında oluşan
          mimik çizgileri belirgin şekilde yumuşar.
        </p>
        <p>
          Uygulama ince uçlu iğnelerle yapılır ve genellikle 10–15 dakika sürer.
          İşlem sonrası günlük yaşama hemen dönülebilir. Etki 3–7 gün içinde belirginleşmeye başlar.
        </p>
      </TreatmentSection>

      <TreatmentSection heading="Hangi bölgelere uygulanır?" index={1}>
        <p>
          En sık tercih edilen uygulama bölgeleri, yüzün üst yarısındaki mimik kaslarıdır:
        </p>
        <ul className="list-none flex flex-col gap-2 pl-0">
          {[
            ['Alın', 'Yatay alın çizgileri — kaş kaldırma hareketi sırasında belirginleşen çizgiler'],
            ['Kaş arası (Glabella)', 'Dikey kaş çatma çizgileri — kaşlar arasındaki "11" görünümlü hatlar'],
            ['Göz çevresi (Kaz ayağı)', 'Gülümseme ve kısma hareketi ile oluşan ince çizgiler'],
          ].map(([title, desc]) => (
            <li key={title} className="flex gap-3 items-start">
              <span className="w-1.5 h-1.5 rounded-full mt-2.5 flex-shrink-0" style={{ background: 'rgba(214,185,140,0.35)' }} />
              <span><strong className="text-[rgba(248,246,242,0.65)] font-medium">{title}</strong> — {desc}</span>
            </li>
          ))}
        </ul>
        <p>
          Bunların dışında burun kanatları, çene ucu, platisma bandları ve aşırı terleme tedavisi gibi
          alanlarda da botoks kullanılabilir.
        </p>
      </TreatmentSection>

      <TreatmentSection heading="Etkisi ne kadar sürer?" index={2}>
        <p>
          Botoks etkisi ortalama 4 ila 6 ay sürer. Bu süre kişinin kas yapısına, metabolizma hızına
          ve uygulanan bölgeye göre değişkenlik gösterebilir. İlk uygulamalarda etki süresi biraz daha
          kısa olabilirken, düzenli uygulama ile kasların dinlenme alışkanlığı kazanması sonucu
          etki süresi uzayabilir.
        </p>
        <p>
          Etkinin azalmaya başlaması ile birlikte prosedür güvenle tekrarlanabilir. Uygulamalar
          arasında en az 3 ay beklenmesi önerilir.
        </p>
      </TreatmentSection>

      <TreatmentSection heading="Kimlere uygulanır?" index={3}>
        <p>
          Botoks, mimik kaynaklı kırışıklıkları olan ya da bu çizgilerin oluşumunu önlemek isteyen
          yetişkin bireylere uygulanabilir. Genellikle 25–65 yaş aralığında tercih edilmektedir.
        </p>
        <p>
          Hamilelik, emzirme döneminde veya nöromüsküler hastalığı olan kişilerde uygulanmaz.
          Tedavi kararı, yüz yapısı ve kişisel beklentiler doğrultusunda hekim tarafından verilir.
        </p>
      </TreatmentSection>

      <TreatmentSection heading="Olası riskler" index={4}>
        <p>
          Botoks, dünyada milyonlarca kez güvenle uygulanan bir prosedürdür. Olası yan etkiler
          genellikle hafif ve geçicidir:
        </p>
        <ul className="list-none flex flex-col gap-2 pl-0">
          {[
            'Uygulama noktasında hafif kızarıklık veya şişlik (birkaç saat)',
            'Küçük morarma (birkaç gün içinde geçer)',
            'Nadir durumlarda geçici kaş düşüklüğü (teknik hassasiyet ile minimize edilir)',
          ].map((item) => (
            <li key={item} className="flex gap-3 items-start">
              <span className="w-1.5 h-1.5 rounded-full mt-2.5 flex-shrink-0" style={{ background: 'rgba(196,122,122,0.40)' }} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <p>
          Tüm estetik uygulamalarda olduğu gibi, işlemin deneyimli bir hekim tarafından,
          steril ortamda ve onaylı ürünlerle yapılması büyük önem taşır.
        </p>
      </TreatmentSection>
    </TreatmentLayout>
  )
}
