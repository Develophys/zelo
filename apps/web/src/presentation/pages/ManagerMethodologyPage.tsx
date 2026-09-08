import { MANAGER_METRICS, MANAGER_METHODOLOGY_VERSION } from "@zelo/domain";
import { Card } from "@/presentation/ui/Card";
import { CardTitle } from "@/presentation/ui/CardTitle";
import { MANAGER_INSIGHT_DISCLAIMER } from "@/presentation/lib/manager-insight-disclaimer";

const SECTIONS: { title: string; body: string }[] = [
  {
    title: "O que o Zelo mede",
    body: "Os questionários usam PHQ-9 (sintomas de depressão) e GAD-7 (sintomas de ansiedade), aplicados em duas etapas: uma triagem curta e, para quem pontua acima do corte, o questionário completo. Nenhum dos dois mede burnout diretamente — o que o painel chama de sinal de sofrimento relevante é um escore acima da faixa leve, condição associada a maior risco de esgotamento profissional.",
  },
  {
    title: "Como um sinal vira um número",
    body: "A resposta é cifrada no aparelho antes de qualquer envio. O que chega ao servidor é um incremento em um contador por setor e por semana — não existe registro individual no banco, apenas contadores. A deduplicação é por dispositivo e semana, e um dispositivo não é uma pessoa: dois profissionais que compartilham um tablet contam como um, e um profissional com dois aparelhos conta como dois. É o preço do anonimato. Na prática: leia \"respostas\", não \"pessoas\".",
  },
  {
    title: "A regra de privacidade",
    body: "Um setor só aparece se tiver ao menos 5 respostas na semana de referência; abaixo disso ele fica fora de todos os números da página, não apenas da lista por setor. A semana de referência é a mais recente em que algum setor atinge esse mínimo — e não simplesmente a última semana do calendário, porque uma semana em curso é parcial por definição e faria o painel inteiro desaparecer toda segunda-feira.",
  },
  {
    title: "Como ler o gráfico de tendência",
    body: "As barras comparam as semanas entre si, não contra uma escala de 0% a 100%. É por isso que uma variação de 40% para 47% ocupa boa parte da altura. O percentual impresso acima de cada barra é sempre o valor literal, e é ele que deve ser citado.",
  },
  {
    title: "O que este painel não é",
    body: MANAGER_INSIGHT_DISCLAIMER,
  },
];

export function ManagerMethodologyPage() {
  return (
    <div className="max-w-[80ch] print:max-w-none [&_*]:print:shadow-none [&_*]:print:bg-transparent">
      <p className="text-label text-muted">Versão {MANAGER_METHODOLOGY_VERSION}</p>

      <div className="mt-3 flex flex-col gap-3.5">
        {SECTIONS.map((section) => (
          <Card key={section.title}>
            <CardTitle>{section.title}</CardTitle>
            <p className="mt-2 text-pretty text-label text-ink-2">{section.body}</p>
          </Card>
        ))}

        <Card>
          <CardTitle>Cada indicador</CardTitle>
          <div className="mt-3 flex flex-col gap-4">
            {Object.values(MANAGER_METRICS).map((metric) => (
              <div key={metric.id} className="break-inside-avoid border-t border-line pt-3 first:border-t-0 first:pt-0">
                <p className="text-body font-extrabold text-ink">{metric.label}</p>
                <dl className="mt-1.5 flex flex-col gap-1.5 text-label text-ink-2">
                  <div>
                    <dt className="font-mono text-mono-data text-muted-2">Como é calculado</dt>
                    <dd className="text-pretty">{metric.method}</dd>
                  </div>
                  <div>
                    <dt className="font-mono text-mono-data text-muted-2">Janela</dt>
                    <dd className="text-pretty">{metric.window}</dd>
                  </div>
                  <div>
                    <dt className="font-mono text-mono-data text-muted-2">Supressão</dt>
                    <dd className="text-pretty">{metric.suppression}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
