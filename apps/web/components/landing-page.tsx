import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, BadgeCheck, Cat, Dog, Heart, MapPin, PawPrint, Plus, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";

const pets = [
  { name: "Jujuba", details: "Golden · 2 anos", location: "Vila Madalena, SP", photo: "photo-1552053831-71594a27632d", color: "#cdbd9f" },
  { name: "Bento", details: "Caramelo · 3 anos", location: "Pinheiros, SP", photo: "photo-1543466835-00a7907e9de1", color: "#c3b49b" },
  { name: "Mia", details: "SRD · 1 ano", location: "Perdizes, SP", photo: "photo-1511044568932-338cba0ad803", color: "#d8d3c8" },
];

function PetCard({ pet, index }: { pet: (typeof pets)[number]; index: number }) {
  return (
    <article className={`pet-card pet-card-${index}`}>
      <div className="pet-card-photo" role="img" aria-label={`Foto de ${pet.name}`} style={{ backgroundColor: pet.color, backgroundImage: `url(https://images.unsplash.com/${pet.photo}?auto=format&fit=crop&w=700&q=85)` }}>
        <span className="pet-online">Perfil ilustrativo</span>
        <Link className="pet-heart" href="/cadastro" aria-label={`Criar conta para conhecer pets como ${pet.name}`}><Heart size={17} /></Link>
      </div>
      <div className="pet-card-copy">
        <div className="pet-title"><h3>{pet.name}</h3><PawPrint size={16} /></div>
        <p>{pet.details}</p>
        <div className="pet-place"><MapPin size={12} />{pet.location}<span>· 2 km</span></div>
      </div>
    </article>
  );
}

export function LandingPage() {
  return (
    <main>
      <div className="hero-wrap" id="inicio">
        <SiteHeader />
        <section className="hero section-frame">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-mark"><PawPrint size={11} /></span> UMA NOVA FORMA DE SE CONECTAR</div>
            <h1>O mundo deles<br />fica melhor <span>juntos.</span></h1>
            <p className="hero-description">Conheça pets por perto, encontre companhia para o seu melhor amigo e faça parte de uma comunidade que coloca o bem-estar em primeiro lugar.</p>
            <div className="hero-actions"><Button size="lg" asChild><Link href="/cadastro">Encontrar novos amigos <ArrowUpRight size={17} /></Link></Button><Link className="text-link" href="#como-funciona">Descubra como funciona <ArrowDown size={14} /></Link></div>
            <div className="hero-proof"><div className="proof-avatars" aria-hidden="true"><span><Dog size={19}/></span><span><Cat size={19}/></span><span><PawPrint size={19}/></span><span><Plus size={16}/></span></div><p><strong>Feito para quem ama de verdade.</strong><br />Conexões pensadas para pets e tutores.</p></div>
          </div>
          <div className="hero-visual">
            <div className="hero-image" role="img" aria-label="Cachorro aproveitando um passeio ao ar livre" />
            <div className="image-caption"><PawPrint size={13}/><span>PEQUENOS ENCONTROS, GRANDES HISTÓRIAS</span></div>
            <div className="floating-note"><div className="note-icon"><Heart size={17} fill="currentColor" /></div><div><strong>Um match de verdade</strong><p>Começa pelo bem-estar.</p></div><Sparkles className="note-sparkle" size={16} /></div>
            <div className="hero-stamp" role="img" aria-label="Feito com carinho">
              <svg className="stamp-ring" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
                <defs><path id="stamp-circle" d="M60,60 m-45,0 a45,45 0 1,1 90,0 a45,45 0 1,1 -90,0" /></defs>
                <text><textPath href="#stamp-circle" textLength="280" lengthAdjust="spacing">FEITO COM CARINHO • FEITO COM CARINHO •</textPath></text>
              </svg>
              <span className="stamp-heart" aria-hidden="true"><Heart size={20} fill="currentColor" /></span>
              <i className="stamp-spark stamp-spark-a" aria-hidden="true" />
              <i className="stamp-spark stamp-spark-b" aria-hidden="true" />
            </div>
          </div>
          <div className="hero-side-label">BONS ENCONTROS COMEÇAM POR AQUI <span>↘</span></div>
        </section>
        <div className="hero-bottom-line" />
      </div>

      <section className="trust-strip" aria-label="Nossos princípios">
        <div className="trust-item"><ShieldCheck size={18} /><span>Bem-estar em primeiro lugar</span></div><span className="trust-divider" />
        <div className="trust-item"><MapPin size={17} /><span>Conexões perto de você</span></div><span className="trust-divider" />
        <div className="trust-item"><Heart size={17} /><span>Uma comunidade com propósito</span></div>
      </section>

      <section className="discover section-frame" id="comunidade">
        <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-mark"><PawPrint size={11} /></span> QUEM SABE O PRÓXIMO MATCH?</div><h2>Novos focinhos.<br /><span>Boas possibilidades.</span></h2></div><div className="heading-aside"><p>Tem sempre um amigo novo por perto. Descubra pets com a mesma energia do seu.</p><Link href="#como-funciona" className="round-link" aria-label="Saiba como funciona"><ArrowRight size={18} /></Link></div></div>
        <div className="pet-grid">{pets.map((pet, index) => <PetCard key={pet.name} pet={pet} index={index} />)}</div>
        <div className="discover-footer"><span>PERFIS ILUSTRATIVOS · EXEMPLOS DE COMO A COMUNIDADE VAI FUNCIONAR</span><Link href="#como-funciona">Conheça a experiência <ArrowUpRight size={14} /></Link></div>
      </section>

      <section className="how-section" id="como-funciona">
        <div className="section-frame how-grid"><div className="how-intro"><div className="eyebrow"><span className="eyebrow-mark"><Sparkles size={11} /></span> SIMPLES ASSIM</div><h2>Um bom encontro<br />muda <span>tudo.</span></h2><p>Menos complicação para você. Mais histórias boas para viver com seu pet.</p><Button variant="outline" asChild><Link href="/cadastro">Quero fazer parte <ArrowUpRight size={15} /></Link></Button></div>
          <div className="steps"><article className="step"><span className="step-number">01</span><div className="step-icon"><PawPrint size={19} /></div><div><h3>Conte sobre o seu pet</h3><p>Um perfil com personalidade, rotina e o que ele gosta de fazer.</p></div><ArrowUpRight className="step-arrow" size={16} /></article><article className="step"><span className="step-number">02</span><div className="step-icon"><Sparkles size={19} /></div><div><h3>Descubra quem combina</h3><p>Pets da sua região, com afinidades e interesses em comum.</p></div><ArrowUpRight className="step-arrow" size={16} /></article><article className="step"><span className="step-number">03</span><div className="step-icon"><Heart size={19} /></div><div><h3>Deixe a conexão acontecer</h3><p>Se o interesse for mútuo, os tutores conversam e combinam.</p></div><ArrowUpRight className="step-arrow" size={16} /></article></div>
        </div>
      </section>

      <section className="care-section section-frame" id="seguranca"><div className="care-panel"><div className="care-photo" role="img" aria-label="Cachorro passeando com seu tutor" /><div className="care-copy"><div className="eyebrow"><span className="eyebrow-mark"><ShieldCheck size={11} /></span> NOSSO JEITO DE FAZER</div><h2>Carinho também<br />é <span>cuidado.</span></h2><p>Uma conexão legal começa com respeito ao tempo, à saúde e aos limites de cada animal. É assim que a comunidade cresce bem.</p><div className="care-points"><div><BadgeCheck size={16} /><span>Informações claras sobre cada pet</span></div><div><ShieldCheck size={16} /><span>Encontros seguros e responsáveis</span></div></div><Link href="/seguranca" className="care-link">Conheça nossos princípios <ArrowRight size={15} /></Link></div></div></section>

      <section className="closing section-frame"><div className="closing-mark"><PawPrint size={19} /></div><div><span>O PRÓXIMO CAPÍTULO TEM QUATRO PATAS</span><h2>Vamos fazer bons encontros?</h2></div><Button size="lg" asChild><Link href="/cadastro">Criar meu perfil <ArrowUpRight size={16} /></Link></Button></section>

      <footer className="site-footer"><div className="footer-top section-frame"><Link className="wordmark" href="#inicio"><span className="wordmark-icon"><PawPrint size={17} /></span><span>match<span>animal</span></span></Link><p>Uma comunidade que aproxima<br />quem ama e quem abana o rabo.</p><nav aria-label="Links do rodapé"><Link href="#como-funciona">Como funciona</Link><Link href="#seguranca">Bem-estar animal</Link><Link href="/privacidade">Privacidade</Link><Link href="/termos">Termos de uso</Link><Link href="/cadastro">Fazer parte</Link></nav></div><div className="footer-bottom section-frame"><span>© 2026 MatchAnimal. Feito no Brasil, com carinho.</span><span>FEITO PARA CONEXÕES DE VERDADE <Heart size={11} /></span></div></footer>
    </main>
  );
}
