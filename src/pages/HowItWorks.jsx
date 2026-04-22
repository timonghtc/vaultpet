import { motion } from 'framer-motion'
import { ArrowRight, Upload, HelpCircle, CreditCard, WalletCards } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'

export default function HowItWorks() {
  const navigate = useNavigate()

  const steps = [
    {
      title: 'Wie kaufe ich Pets?',
      text: 'Marketplace öffnen, Pet auswählen, in den Warenkorb legen und Checkout abschließen.',
      icon: HelpCircle
    },
    {
      title: 'Wie läuft die Lieferung ab?',
      text: 'Nach erfolgreicher Bestellung wird dein Pet in der Regel innerhalb von 30 Minuten geliefert.',
      icon: ArrowRight
    },
    {
      title: 'Wie funktioniert das Bezahlen?',
      text: 'Bezahlen geht nur mit Guthaben. Guthaben lädst du auf der Guthaben-Seite mit PayPal auf.',
      icon: CreditCard
    },
    {
      title: 'Wie bekomme ich Geld aus Verkäufen?',
      text: 'Nach dem Verkauf bekommst du eine Nachricht. Das Guthaben wird nach dem Bot-Trade freigeschaltet.',
      icon: WalletCards
    }
  ]

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8">
        <h1 className="font-heading text-4xl text-foreground">🚀 So läuft’s bei PetVault</h1>
        <p className="text-muted-foreground font-semibold mt-2">
          Alles kurz erklärt: Kaufen, Aufladen, Bezahlen, Verkaufen.
        </p>
      </div>

      <div className="grid gap-4 mb-6">
        {steps.map((s) => {
          const Icon = s.icon
          return (
            <motion.div key={s.title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="p-5 border-2 border-border rounded-2xl bg-white flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="font-heading text-xl text-foreground">{s.title}</div>
                  <div className="text-sm text-muted-foreground font-semibold mt-1">
                    {s.text}
                  </div>
                </div>
              </Card>
            </motion.div>
          )
        })}
      </div>

      <Card className="p-5 border-2 border-border rounded-2xl bg-white">
        <div className="font-heading text-2xl text-foreground mb-2">❓ FAQ</div>
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="faq-buy">
            <AccordionTrigger>Wie kaufe ich ein Pet?</AccordionTrigger>
            <AccordionContent>
              Gehe zum Marketplace, wähle ein Pet aus, lege es in den Warenkorb und schließe den Kauf im Checkout ab.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="faq-sell">
            <AccordionTrigger>Wie verkaufe ich mein Pet?</AccordionTrigger>
            <AccordionContent>
              Klicke auf „Verkaufen“ und reiche dein Pet ein. Dein Pet wird zuerst geprüft und muss von einem Admin genehmigt werden, bevor es im Marketplace erscheint.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="faq-approval">
            <AccordionTrigger>Warum muss mein Pet genehmigt werden?</AccordionTrigger>
            <AccordionContent>
              Damit Listings sauber bleiben (Name, Preis, Bild, Details). Nach der Genehmigung wird dein Pet öffentlich im Marketplace angezeigt.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="faq-wallet-topup">
            <AccordionTrigger>Wie lade ich Guthaben auf?</AccordionTrigger>
            <AccordionContent>
              Tippe oben auf dein Guthaben-Badge, öffne die Guthaben-Seite und lade mit PayPal auf.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="faq-payment">
            <AccordionTrigger>Wie läuft die Zahlung ab?</AccordionTrigger>
            <AccordionContent>
              In PetVault zahlst du nur mit Guthaben. Wenn dein Guthaben ausreicht, kannst du direkt im Warenkorb zahlen.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="faq-payout">
            <AccordionTrigger>Wann bekomme ich mein Geld, wenn ich etwas verkauft habe?</AccordionTrigger>
            <AccordionContent>
              Nach dem Verkauf bekommst du zuerst eine Nachricht. Dein Guthaben wird erst freigeschaltet, wenn du das Pet ingame an den Bot übergeben hast. Danach wird die Auszahlung bestätigt und dem Guthaben gutgeschrieben.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="faq-bot">
            <AccordionTrigger>Was hat es mit dem Bot auf sich?</AccordionTrigger>
            <AccordionContent>
              Der Bot kümmert sich um die Übergabe. Du musst in Adopt Me online sein, auf eine Freundschaftsanfrage auf Roblox warten und danach kommt die Trade-Anfrage (meist 5–10 Minuten). Nach dem Trade wird geliefert oder Guthaben freigeschaltet.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="faq-time">
            <AccordionTrigger>Wie lange dauert es normalerweise?</AccordionTrigger>
            <AccordionContent>
              Meistens dauert es nicht länger als 5–10 Minuten. Bitte bleib in Adopt Me online, damit der Bot dich traden kann.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="faq-sell-credit">
            <AccordionTrigger>Was passiert, wenn ich ein Pet verkaufe?</AccordionTrigger>
            <AccordionContent>
              Du bekommst eine Nachricht mit den nächsten Schritten. Nach dem Bot-Trade wird dein Guthaben gutgeschrieben.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="faq-support">
            <AccordionTrigger>Ich brauche Hilfe – an wen wende ich mich?</AccordionTrigger>
            <AccordionContent>
              Schreib an support.petvault@gmail.com. Du findest auch Hilfe direkt im Account unter „Nachrichten“ → „Hilfe / FAQ“.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Card>

      <div className="mt-8 flex flex-col sm:flex-row gap-3">
        <Button className="rounded-2xl font-bold" onClick={() => navigate('/marketplace')}>
          Zum Marketplace <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
        <Button variant="outline" className="rounded-2xl font-bold" onClick={() => navigate('/sell')}>
          Pet verkaufen <Upload className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  )
}
