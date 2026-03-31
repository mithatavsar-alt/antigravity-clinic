import type { Metadata } from 'next'
import { TreatmentHero } from '@/components/treatments/TreatmentHero'
import { TreatmentSection } from '@/components/treatments/TreatmentSection'
import { TreatmentLayout } from '@/components/treatments/TreatmentLayout'

export const metadata: Metadata = {
  title: 'Dolgu Uygulamaları — Antigravity Clinic',
  description: 'Hyalüronik asit dolgu uygulamaları hakkında bilgilendirme: uygulama bölgeleri, kalıcılık süresi ve doğal görünüm. Dr. Müjde Ocak kliniğinde kişiye özel estetik çözümler.',
}

const RELATED = [
  { label: 'Botoks', href: '/treatments/botox' },
  { label: 'Mezoterapi', href: '/treatments/mesotherapy' },
]

export default function FillerPage() {
  return (
    <TreatmentLayout relatedLinks={RELATED}>
      <TreatmentHero
        label="Tedavi Bilgilendirme"
        title="Dolgu Uygulamaları"
        subtitle="Hyalüronik asit bazlı dolgu maddeleri, yüzdeki hacim kaybını telafi ederek daha genç ve dinlenmiş bir görünüm sağlayan güvenli bir estetik uygulamadır."
      />

      <TreatmentSection heading="Dolgu nedir?" index={0}>
        <p>
          Dermal dolgu, cildin altına enjekte edilen ve doğal olarak vücutta bulunan hyalüronik asit
          (HA) bazlı jel bir maddedir. Yaşla birlikte azalan hacmi geri kazandırır, kırışıklıkları
          doldurur ve yüz hatlarını yeniden şekillendirir.
        </p>
        <p>
          Hyalüronik asit, vücutta doğal olarak bulunan bir moleküldür ve su tutma kapasitesi
          sayesinde ciltte dolgunluk ve nem sağlar. Uygulama 20–40 dakika sürer ve sonuçlar
          anında görülmeye başlar.
        </p>
      </TreatmentSection>

      <TreatmentSection heading="Hangi bölgelerde kullanılır?" index={1}>
        <p>
          Dolgu uygulamaları yüzün farklı bölgelerinde kullanılarak dengeyi ve uyumu artırmayı hedefler:
        </p>
        <ul className="list-none flex flex-col gap-2 pl-0">
          {[
            ['Nazolabial hat', 'Burun kenarından dudak köşesine uzanan çizgilerin yumuşatılması'],
            ['Dudak', 'Dudak hacminin artırılması veya sınırlarının belirginleştirilmesi'],
            ['Yanak ve elmacık kemiği', 'Orta yüz hacminin yeniden kazandırılması'],
            ['Çene hattı (Jawline)', 'Alt yüz konturunun belirginleştirilmesi ve sarkmaların önlenmesi'],
            ['Göz altı', 'Göz altı çukurluğunun yumuşatılması (gözyaşı oluğu dolgusu)'],
          ].map(([title, desc]) => (
            <li key={title} className="flex gap-3 items-start">
              <span className="w-1.5 h-1.5 rounded-full mt-2.5 flex-shrink-0" style={{ background: 'rgba(214,185,140,0.35)' }} />
              <span><strong className="text-[rgba(248,246,242,0.65)] font-medium">{title}</strong> — {desc}</span>
            </li>
          ))}
        </ul>
      </TreatmentSection>

      <TreatmentSection heading="Ne kadar kalıcıdır?" index={2}>
        <p>
          Dolgu uygulamasının kalıcılık süresi kullanılan ürüne, uygulama bölgesine ve kişinin
          metabolizmasına bağlı olarak 6 ile 18 ay arasında değişir.
        </p>
        <p>
          Dudak dolgularında süre genellikle 6–9 ay iken, elmacık kemiklerinde ve çene hattında
          12–18 aya kadar uzayabilir. Hyalüronik asit zaman içinde vücut tarafından doğal yollarla
          emilir; bu nedenle uygulama kalıcı değildir ve istenildiğinde tekrarlanabilir.
        </p>
      </TreatmentSection>

      <TreatmentSection heading="Doğal görünüm" index={3}>
        <p>
          Modern dolgu uygulamalarının temel hedefi, doğallıktan ödün vermeden görünümü
          iyileştirmektir. Doğru teknik ve deneyimli bir hekimle, dolgu uygulaması &quot;yaptırılmış&quot;
          görünümden uzak, kişinin kendi yüz yapısını destekleyen sonuçlar verir.
        </p>
        <p>
          Tedavi planlaması sırasında hekim, yüz oranlarını, mevcut hacim dağılımını ve
          kişisel beklentileri birlikte değerlendirir. Kademeli uygulama yaklaşımı ile
          aşırı dolgunluk riski en aza indirilir.
        </p>
      </TreatmentSection>

      <TreatmentSection heading="Uygulamaya hazırlık" index={4}>
        <p>
          İşlem öncesinde kan sulandırıcı ilaçlar ve takviyeler (aspirin, omega-3, E vitamini)
          hekime danışılarak kesilmelidir. Uygulama sonrası birkaç gün boyunca yoğun egzersiz,
          sauna ve yüze baskı uygulanmasından kaçınılması önerilir.
        </p>
        <p>
          İşlem sonrası hafif şişlik veya kızarıklık normal kabul edilir ve genellikle 1–3 gün
          içinde geriler. Ciddi bir komplikasyon nadirdir; ancak herhangi bir endişe durumunda
          hekimle iletişime geçilmelidir.
        </p>
      </TreatmentSection>
    </TreatmentLayout>
  )
}
