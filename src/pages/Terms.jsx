import React from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, FileText, Mail } from 'lucide-react';

const sections = [
  {
    num: '1',
    title: 'Eligibility',
    content: 'Users must be at least 18 years old to use this platform. By using this app, you confirm that you meet this requirement.'
  },
  {
    num: '2',
    title: 'Nature of Platform',
    content: 'ClashArena is a skill-based gaming platform. Outcomes depend on player skill, not chance.'
  },
  {
    num: '3',
    title: 'User Responsibility',
    content: 'Users are responsible for maintaining the confidentiality of their account details.'
  },
  {
    num: '4',
    title: 'Entry Fees & Rewards',
    content: 'Users may pay entry fees to participate in matches. Rewards are distributed based on match results.'
  },
  {
    num: '5',
    title: 'No Guarantee of Earnings',
    content: 'Winning is not guaranteed. Earnings depend entirely on user performance.'
  },
  {
    num: '6',
    title: 'Fraud & Misuse',
    content: 'Any fraudulent activity, including multiple accounts or unfair practices, will result in immediate account suspension.'
  },
  {
    num: '7',
    title: 'Payments',
    content: 'All payments are processed through secure third-party providers. The platform is not responsible for payment gateway issues.'
  },
  {
    num: '8',
    title: 'Refund Policy',
    content: 'Entry fees are non-refundable once a match has been joined.'
  },
  {
    num: '9',
    title: 'Account Suspension',
    content: 'We reserve the right to suspend or terminate accounts that violate our policies.'
  },
  {
    num: '10',
    title: 'Changes to Terms',
    content: 'We may update these terms at any time without prior notice. Continued use of the platform constitutes acceptance of the new terms.'
  }
];

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.06 } }
};

const staggerItem = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } }
};

export default function Terms({ onBack }) {
  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-dark)' }}>
      <motion.div
        style={{
          position: 'sticky', top: 0, zIndex: 10,
          background: 'rgba(22,22,31,0.95)',
          backdropFilter: 'blur(10px)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          padding: '16px 20px',
          display: 'flex', alignItems: 'center', gap: 12
        }}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <motion.button
          onClick={onBack}
          whileTap={{ scale: 0.9 }}
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: 10, padding: '7px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600 }}
        >
          <ChevronLeft size={16} /> Back
        </motion.button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText size={18} color="var(--primary)" />
          <span style={{ fontWeight: 800, fontSize: 17 }}>Terms &amp; Conditions</span>
        </div>
      </motion.div>

      <div style={{ padding: '24px 20px 40px' }}>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          style={{ background: 'linear-gradient(135deg, rgba(255,77,0,0.1), rgba(255,215,0,0.05))', border: '1px solid rgba(255,77,0,0.2)', borderRadius: 16, padding: '18px 20px', marginBottom: 24 }}
        >
          <h2 style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>
            ClashArena <span style={{ color: 'var(--primary)' }}>Terms & Conditions</span>
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>
            Please read these terms carefully before using the platform. By accessing ClashArena, you agree to be bound by the following terms.
          </p>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          {sections.map((section) => (
            <motion.div
              key={section.num}
              variants={staggerItem}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: 14,
                padding: '16px 18px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{
                  minWidth: 30, height: 30,
                  background: 'rgba(255,77,0,0.15)',
                  border: '1px solid rgba(255,77,0,0.3)',
                  borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 800, color: 'var(--primary)',
                  flexShrink: 0
                }}>
                  {section.num}
                </div>
                <div>
                  <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, color: 'white' }}>{section.title}</h4>
                  <p style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.65 }}>{section.content}</p>
                </div>
              </div>
            </motion.div>
          ))}

          <motion.div
            variants={staggerItem}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid rgba(255,255,255,0.05)',
              borderRadius: 14,
              padding: '16px 18px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ minWidth: 30, height: 30, background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#3b82f6', flexShrink: 0 }}>
                11
              </div>
              <div>
                <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, color: 'white' }}>Contact</h4>
                <p style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.65 }}>
                  For any queries, reach out to us at{' '}
                  <a href="mailto:support@clasharena.com" style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>
                    support@clasharena.com
                  </a>
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          style={{ textAlign: 'center', marginTop: 28, padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}
        >
          <p style={{ fontSize: 12, color: '#555', lineHeight: 1.6 }}>
            Last updated: 2025 &nbsp;•&nbsp; ClashArena &nbsp;•&nbsp; All rights reserved
          </p>
        </motion.div>
      </div>
    </div>
  );
}
