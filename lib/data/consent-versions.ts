import type { ConsentVersion } from '@/types/consent'

export const consentVersions: ConsentVersion[] = [
  {
    version: '1.0.0',
    effective_date: '2026-01-01T00:00:00Z',
    is_active: true,
    kvkk_text: `KVKK AYDINLATMA METNİ

Dr. Müjde Ocak Aesthetic Clinic olarak kişisel verilerinizin güvenliği hususuna azami hassasiyet göstermekteyiz. Bu doğrultuda 6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında sizi bilgilendirmek isteriz.

VERİ SORUMLUSU: Dr. Müjde Ocak Aesthetic Clinic

İŞLENEN KİŞİSEL VERİLER: Ad-soyad, telefon numarası, yaş aralığı, cinsiyet, yüz fotoğrafı ve estetik tercihlerinize ilişkin bilgiler.

VERİLERİN İŞLENME AMACI: Ön değerlendirme analizi yapılması, doktor randevusu planlanması ve tıbbi kayıt tutulması.

VERİLERİN AKTARIMI: Kişisel verileriniz üçüncü kişilerle paylaşılmamaktadır.

SAKLAMA SÜRESİ: Verileriniz yasal yükümlülükler çerçevesinde 5 yıl süreyle saklanmaktadır.

HAKLARINIZ: KVKK madde 11 kapsamında verilerinize erişim, düzeltme, silme ve itiraz haklarına sahipsiniz.

İLETİŞİM: info@drmujdeocak.com`,
    consent_text: `AÇIK RIZA METNİ

6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında hazırlanan Aydınlatma Metni'ni okudum ve anladım.

Yüz fotoğrafım dahil tüm kişisel verilerimin ön değerlendirme analizi amacıyla işlenmesine, kliniğin yetkili doktorları tarafından incelenmesine ve tıbbi değerlendirme kapsamında kullanılmasına açık rızamı veriyorum.

Bu rızamı istediğim zaman geri alabileceğimi biliyorum.`,
  },
]

export function getActiveConsentVersion(): ConsentVersion {
  return consentVersions.find((v) => v.is_active)!
}
