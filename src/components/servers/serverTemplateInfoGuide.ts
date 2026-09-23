import { InfoItem } from '../bulk-config/templateInfoGuide';

export interface ServerTemplateGuideItem {
  template: InfoItem;
  parameters: Record<string, InfoItem>;
}

export const SERVER_TEMPLATE_GUIDES_FA: Record<string, ServerTemplateGuideItem> = {
  linux_user_management: {
    template: {
      what: 'مدیریت یکپارچه چرخه حیات کاربران، گروه‌ها، مجوزها و انقضای حساب در سطح سرورهای لینوکس.',
      why: 'جهت اعمال سیاست‌های هویتی، دسترسی سازمانی، مدیریت دسترسی به sudo یا گروه‌های docker و حذف امن کاربران سابق.',
      example: 'ایجاد کاربر devops و عضویت در گروه‌های sudo و docker با شل /bin/bash و دایرکتوری خانگی استاندارد.'
    },
    parameters: {
      action: {
        what: 'نوع عملیات روی کاربر (ایجاد، حذف، قفل، بازگشایی، عضویت در گروه، حذف از گروه یا تنظیم انقضا).',
        why: 'تعیین‌کننده رفتار اجرایی ابزارهای useradd, usermod, userdel یا chage در سیستم‌عامل.',
        example: 'create_user, delete_user, add_to_groups, remove_from_groups, lock_user, expire_password'
      },
      username: {
        what: 'نام کاربری استاندارد سیستم‌عامل لینوکس (حروف کوچک، بدون فاصله).',
        why: 'شناسه اصلی حساب کاربری در فایل /etc/passwd.',
        example: 'developer, sysadmin, auditor, devops'
      },
      groups: {
        what: 'لیست گروه‌های ثانویه که کاربر باید به آنها اضافه شود (با کاما جدا شوند).',
        why: 'اعطای دسترسی‌های خاص سیستمی نظیر اجرای داکر، سرپرستی sudo یا دسترسی به لاگ‌ها.',
        example: 'sudo,docker,adm یا wheel,docker'
      },
      remove_groups: {
        what: 'لیست گروه‌هایی که کاربر باید از عضویت آنها خارج شود.',
        why: 'سلب دسترسی‌های حساس در هنگام تغییر نقش یا جدایی اعضای تیم.',
        example: 'sudo,docker'
      },
      shell: {
        what: 'مسیر مفسر فرمان (Login Shell) پیش‌فرض کاربر هنگام ورود SSH.',
        why: 'تعیین محیط ترمینال تعاملی یا مسدودسازی ورود با nologin برای کاربران سیستمی.',
        example: '/bin/bash, /bin/zsh, /sbin/nologin'
      },
      delete_home: {
        what: 'پاک‌سازی کامل دایرکتوری خانگی (/home/user) هنگام حذف کاربر.',
        why: 'جلوگیری از باقی ماندن فایل‌های بلااستفاده و پر شدن فضای ذخیره‌سازی سرور.',
        example: 'فعال (True) برای حذف کامل همراه با سوییچ -r'
      },
      force_delete: {
        what: 'خاتمه اجباری پردازش‌های در حال اجرای کاربر و حذف فوری حساب.',
        why: 'امکان حذف کاربر حتی در صورتی که پردازشی با UID آن در حال اجرا باشد.',
        example: 'فعال (True) برای کشتن پردازش‌های بازمانده کاربر قبل از حذف'
      },
      expire_days: {
        what: 'تعداد روزهای باقیمانده تا انقضای خودکار حساب کاربری.',
        why: 'تعیین مهلت دسترسی موقت برای پیمانکاران یا تست‌های امنیتی دوره‌ای.',
        example: '30 (انقضا پس از یک ماه), 90 (سه ماه)'
      }
    }
  },
  linux_cron_add_job: {
    template: {
      what: 'تنظیم و زمان‌بندی هوشمند وظایف خودکار دوره‌ای (Cron Jobs) در فایل Crontab سرورها.',
      why: 'اجرای برنامه‌ریزی‌شده اسکریپت‌های پشتیبان‌گیری، نگهداری دوره‌ای، لاگ‌روتیشن و بررسی‌های سیستمی.',
      example: 'اجرای اسکریپت بکاپ دیتابیس /opt/backup.sh هر شب در ساعت ۰۲:۰۰ بامداد.'
    },
    parameters: {
      job_id: {
        what: 'شناسه تگ یکتا جهت علامت‌گذاری و ردیابی آسان وظیفه در Crontab.',
        why: 'جلوگیری از ثبت تکراری وظیفه و امکان حذف یا ویرایش دقیق آن در دفعات بعدی.',
        example: 'nightly_db_backup, log_cleanup, healthcheck'
      },
      schedule_preset: {
        what: 'انتخاب دوره تکرار استاندارد از میان گزینه‌های متداول.',
        why: 'ساده‌سازی زمان‌بندی بدون نیاز به نوشتن دستی عبارات ۵ فیلدی پیچیده کرون.',
        example: 'daily (روزانه ساعت ۰۰:۰۰), hourly (ساعتی), reboot (هنگام بوت)'
      },
      cron_expression: {
        what: 'فرمت استاندارد ۵ فیلدی کرون: دقیقه، ساعت، روز ماه، ماه، روز هفته.',
        why: 'انعطاف‌پذیری کامل برای الگوهای زمان‌بندی خاص و پیچیده.',
        example: '0 2 * * * (هر شب ساعت ۲), */15 * * * * (هر ۱۵ دقیقه)'
      },
      command: {
        what: 'دستور یا مسیر کامل اسکریپت شل که باید در زمان مشخص اجرا شود.',
        why: 'هسته عملیاتی وظیفه خودکار روی سرور.',
        example: '/opt/scripts/backup.sh >> /var/log/backup.log 2>&1'
      },
      user: {
        what: 'کاربر اجراکننده وظیفه کرون (معمولاً root یا کاربر اپلیکیشن).',
        why: 'اعمال سطح دسترسی مناسب جهت اجرای ایمن بدون نقض مجوزها.',
        example: 'root, www-data, appuser'
      }
    }
  },
  linux_mount_storage: {
    template: {
      what: 'مانت و اتصال دیسک‌های جدید، پارتیشن‌های ابری یا اشتراک‌های شبکه (NFS/CIFS) همراه با ثبت پایدار در fstab.',
      why: 'توسعه فضای دیسک، افزودن والیوم‌های استوریج یا اتصال فضاهای اشتراکی به سرورها بدون از دست رفتن پس از ریبوت.',
      example: 'مانت دیسک /dev/sdb1 با فایل‌سیستم ext4 روی دایرکتوری /mnt/data و افزودن رکورد پایدار در fstab.'
    },
    parameters: {
      device: {
        what: 'نام دیوایس بلوکی، UUID یا آدرس اشتراک شبکه (NFS share).',
        why: 'منبع ورودی حافظه که باید به سیستم متصل شود.',
        example: '/dev/sdb1, UUID=e4d2..., 192.168.1.50:/volume1/storage'
      },
      mount_point: {
        what: 'مسیر پوشه در سیستم‌عامل لینوکس که دیسک روی آن مانت می‌شود.',
        why: 'مسیری که برنامه‌ها و کاربران برای دسترسی به فایل‌های دیسک از آن استفاده می‌کنند.',
        example: '/mnt/storage, /var/data, /opt/backup'
      },
      fstype: {
        what: 'نوع سیستم فایل دیسک یا پروتکل اشتراک فایل.',
        why: 'درایور موردنیاز کرنل برای خواندن و نوشتن روی پارتیشن.',
        example: 'ext4, xfs, btrfs, nfs, cifs'
      },
      options: {
        what: 'گزینه‌های کنترلی مانت نظیر دسترسی، بهینه‌سازی و کش.',
        why: 'تنظیم سطح دسترسی (خواندن/نوشتن، اجرا و عدم تاخیر در بوت).',
        example: 'defaults,noatime,nofail'
      },
      persist_fstab: {
        what: 'افزودن خط پیکربندی به فایل /etc/fstab سرور.',
        why: 'تضمین مانت خودکار دیسک پس از خاموش و روشن شدن یا ریبوت سرور.',
        example: 'فعال (True) برای پایداری پس از ریبوت'
      }
    }
  },
  linux_firewall_rule: {
    template: {
      what: 'مدیریت و اعمال قوانین کنترل دسترسی پورت‌ها و پروتکل‌ها روی فایروال سرور (UFW, Firewalld یا Iptables).',
      why: 'حفاظت امنیتی از پورت‌های باز سرور، مسدودسازی ترافیک ناخواسته و محدود کردن پورت‌های حساسی نظیر SSH و DB.',
      example: 'باز کردن پورت HTTPS (443/tcp) برای همه کلاینت‌ها، یا مسدود کردن پورت‌های ناامن.'
    },
    parameters: {
      action: {
        what: 'عملیات فایروال: باز کردن (allow)، مسدودسازی (deny) یا حذف قانون (delete).',
        why: 'تعیین نوع واکنش فایروال به بسته‌های ورودی به پورت مشخص.',
        example: 'allow, deny, delete'
      },
      port: {
        what: 'شماره پورت مقصد یا نام سرویس استاندارد.',
        why: 'شناسایی سرویسی که قانون باید روی آن اعمال شود.',
        example: '80 (HTTP), 443 (HTTPS), 22 (SSH), 3306 (MySQL), 5432 (Postgres)'
      },
      protocol: {
        what: 'پروتکل لایه انتقال (TCP یا UDP).',
        why: 'تفکیک ترافیک بر اساس پروتکل بسته‌های شبکه.',
        example: 'tcp, udp'
      },
      source_cidr: {
        what: 'محدوده IP یا ساب‌نت مبدا که قانون فقط شامل آن می‌شود.',
        why: 'ایجاد لیست سفید (Whitelist) جهت محدودسازی دسترسی فقط به دفاتر شرکت یا VPN.',
        example: 'any (عمومی), 192.168.1.0/24, 10.10.0.5/32'
      }
    }
  },
  linux_docker_container: {
    template: {
      what: 'مدیریت خودکار وضعیت کانتینرهای داکر در سطح ناوگان (راه‌اندازی، ری‌استارت، پاک‌سازی منابع و پرسیستنت).',
      why: 'نگهداری و مدیریت متمرکز میکروسرویس‌ها، اعمال سیاست‌های ری‌استارت و آزادسازی حافظه داکر.',
      example: 'پاک‌سازی تمام ایمیج‌ها و کانتینرهای معلق با prune و راه‌اندازی مجدد سرویس‌های حیاتی.'
    },
    parameters: {
      action: {
        what: 'نوع اقدام داکر: ری‌استارت کانتینرها، پاک‌سازی حافظه (prune)، استاتوس یا لاگ.',
        why: 'هدایت دستورات متناسب به انجین داکر در تمام سرورها.',
        example: 'restart_all, system_prune, inspect_running'
      },
      container_name: {
        what: 'نام یا الگوی کانتینر هدف برای اعمال تغییرات.',
        why: 'محدود کردن عملیات به کانتینر خاص بدون اختلال در سایر سرویس‌ها.',
        example: 'web_app, redis_cache, nginx_proxy, all'
      }
    }
  },
  linux_directory_lifecycle_backup: {
    template: {
      what: 'مدیریت یکپارچه سیاست‌های فشرده‌سازی بکاپ، پاک‌سازی فایل‌های قدیمی بر اساس سن، مهار حجم دایرکتوری و همگام‌سازی با تضمین عدم حذف یا بازنویسی آرشیوهای قبلی.',
      why: 'حفاظت پایدار از داده‌ها، جلوگیری از پر شدن دیسک سرور و پشتیبان‌گیری منظم در سطح کل ناوگان لینوکس.',
      example: 'تهیه بکاپ روزانه از /var/log/nginx در پوشه /backup/archives با فرمت tar.gz و حفظ تمام نسخه‌های تاریخی.'
    },
    parameters: {
      action: {
        what: 'نوع سیاست اجرایی: بکاپ فشرده، پاک‌سازی فایل‌های قدیمی، سقف حجم دایرکتوری یا همگام‌سازی.',
        why: 'تعیین‌کننده عملکرد اسکریپت روی دایرکتوری هدف در سرورها.',
        example: 'backup, cleanup, size_cap, sync'
      },
      target_path: {
        what: 'مسیر دایرکتوری در سرور که سیاست روی آن اجرا می‌شود.',
        why: 'تعیین محدوده دقیق فایل‌های تحت مدیریت سیاست.',
        example: '/var/log/nginx, /opt/data, /var/backups'
      },
      schedule_mode: {
        what: 'حالت اجرا: اجرای فوری در یک نوبت یا زمان‌بندی مداوم در کرون‌جاب (روزانه، هفتگی، ساعتی).',
        why: 'اتوماسیون دوره‌ای بدون نیاز به پیکربندی دستی crontab.',
        example: 'run_once (فوری), daily (روزانه ساعت ۰۲:۰۰), weekly (هفتگی)'
      },
      backup_format: {
        what: 'الگوریتم فشرده‌سازی فایل آرشیو (tar.gz, tar.bz2, tar.xz, zip).',
        why: 'ایجاد تعادل بین سرعت اجرا و نسبت فشرده‌سازی فایل نهایی.',
        example: 'tar.gz (سریع و استاندارد), tar.xz (بالاترین فشرده‌سازی)'
      },
      backup_destination_path: {
        what: 'مسیر پوشه در سرور جهت ذخیره فایل‌های آرشیو بکاپ.',
        why: 'جداسازی داده‌های فعال از فایل‌های پشتیبان جهت امنیت و نظم سیستم.',
        example: '/backup/archives, /var/backups/fleet'
      },
      backup_keep_source_files: {
        what: 'حفظ فایل‌های اصلی در دایرکتوری مبدا پس از اتمام فشرده‌سازی.',
        why: 'جلوگیری از توقف سرویس‌هایی که به فایل‌های مبدا نیاز دارند.',
        example: 'فعال (True) برای حفظ مبدا'
      },
      backup_preserve_all: {
        what: 'حالت ایمن: حفظ کامل تمام بکاپ‌های قبلی با نام‌گذاری غیرتداخلی بدون بازنویسی یا حذف.',
        why: 'تضمین صددرصدی اینکه بکاپ‌های گذشته هرگز پاک نشده و آرشیوهای قبلی از بین نمی‌روند.',
        example: 'فعال (Safe Preservation Mode)'
      },
      backup_max_count: {
        what: 'حداکثر تعداد آرشیوهای نگهداری‌شده در صورت غیرفعال بودن حالت حفظ کامل (Auto-Rotate).',
        why: 'جلوگیری از مصرف بیش از حد دیسک در صورت ترجیح چرخش خودکار.',
        example: '7 (نگهداری ۷ نسخه اخیر) یا 14'
      },
      retention_days: {
        what: 'سقف نگهداری فایل‌ها بر حسب روز در حالت پاک‌سازی (cleanup).',
        why: 'حذف خودکار فایل‌های قدیمی‌تر از این سن جهت آزادسازی فضا.',
        example: '30 روز (حذف فایل‌های بیش از ۱ ماه)'
      },
      file_pattern: {
        what: 'الگوی تطبیق نام فایل‌ها برای پاک‌سازی (مانند *.log).',
        why: 'فیلتر دقیق فایل‌های هدف بدون لمس سایر فایل‌های دایرکتوری.',
        example: '*.log, *.tmp, *.audit'
      },
      size_cap_mb: {
        what: 'سقف مجاز حجم کل دایرکتوری بر حسب مگابایت در حالت size_cap.',
        why: 'حذف قدیمی‌ترین فایل‌ها تا رسیدن حجم دایرکتوری به زیر این سقف.',
        example: '1024 (۱ گیگابایت), 5120 (۵ گیگابایت)'
      },
      sync_destination_path: {
        what: 'مسیر مقصد در سرور برای کلون یا همگام‌سازی دایرکتوری.',
        why: 'ایجاد نسخه آینه‌ای روی دیسک یا پارتیشن دیگر.',
        example: '/backup/mirrors/nginx, /mnt/storage/mirror'
      },
      sync_delete_extraneous: {
        what: 'حذف فایل‌های اضافه در مقصد همگام‌سازی که در مبدا وجود ندارند (--delete).',
        why: 'انطباق ۱۰۰ درصدی مقصد با مبدا.',
        example: 'غیرفعال (False) جهت ایمنی'
      }
    }
  }
};

export const SERVER_TEMPLATE_GUIDES_EN: Record<string, ServerTemplateGuideItem> = {
  linux_user_management: {
    template: {
      what: 'Unified user lifecycle, secondary groups, credential expiration and account policy automation across Linux fleets.',
      why: 'Enforces identity baselines, grants sudo/docker privileges consistently, and securely purges former user access.',
      example: 'Provision user "devops" into secondary groups "sudo" and "docker" with /bin/bash shell and home directory.'
    },
    parameters: {
      action: {
        what: 'User operation mode (create, delete, lock, unlock, add to groups, remove from groups, expire password).',
        why: 'Directs underlying useradd, usermod, userdel, or chage utilities.',
        example: 'create_user, delete_user, add_to_groups, remove_from_groups, lock_user, expire_password'
      },
      username: {
        what: 'Standard Linux username (lowercase, alphanumeric, no spaces).',
        why: 'Primary account identifier in /etc/passwd.',
        example: 'developer, sysadmin, auditor, devops'
      },
      groups: {
        what: 'Comma-separated secondary groups to attach the user to.',
        why: 'Grants privileged system access (sudo execution, docker engine control).',
        example: 'sudo,docker,adm or wheel,docker'
      },
      remove_groups: {
        what: 'Comma-separated groups to remove the user membership from.',
        why: 'Revokes sensitive privileges during role changes or offboarding.',
        example: 'sudo,docker'
      },
      shell: {
        what: 'Default login shell executable path.',
        why: 'Specifies interactive shell environment or blocks login via /sbin/nologin.',
        example: '/bin/bash, /bin/zsh, /sbin/nologin'
      },
      delete_home: {
        what: 'Recursively remove user home directory (/home/user) on account deletion.',
        why: 'Cleans up orphan storage space and removes abandoned user data.',
        example: 'True (passes -r flag to userdel)'
      },
      force_delete: {
        what: 'Force termination of user processes before deleting account.',
        why: 'Ensures deletion succeeds even if user processes or daemon threads are still active.',
        example: 'True (passes -f flag to userdel)'
      },
      expire_days: {
        what: 'Number of days until the account automatically expires.',
        why: 'Sets temporary access windows for contractors, vendors, or trial periods.',
        example: '30 (1 month), 90 (quarterly)'
      }
    }
  },
  linux_cron_add_job: {
    template: {
      what: 'Schedule and manage periodic cron tasks across Linux servers with standard presets or 5-field cron syntax.',
      why: 'Automates scheduled maintenance, nightly database backups, log rotation, and periodic health checks.',
      example: 'Run /opt/backup.sh every night at 02:00 AM via user root with unique idempotency tag.'
    },
    parameters: {
      job_id: {
        what: 'Unique tag identifier for the cron task in the crontab header.',
        why: 'Prevents duplicate job entries and enables surgical editing or removal.',
        example: 'nightly_db_backup, log_cleanup, cert_renew'
      },
      schedule_preset: {
        what: 'Standard schedule preset interval.',
        why: 'Simplifies recurring job scheduling without manually crafting 5-field cron syntax.',
        example: 'daily (00:00), hourly, reboot (@reboot)'
      },
      cron_expression: {
        what: 'Standard 5-field cron expression (minute hour day month day-of-week).',
        why: 'Full flexibility for specialized execution schedules.',
        example: '0 2 * * * (daily at 2am), */15 * * * * (every 15 min)'
      },
      command: {
        what: 'Full shell command or script path executed on schedule.',
        why: 'Core automated workload payload.',
        example: '/opt/scripts/backup.sh >> /var/log/backup.log 2>&1'
      },
      user: {
        what: 'Target Linux system user owning the crontab.',
        why: 'Enforces principle of least privilege during scheduled runs.',
        example: 'root, www-data, appuser'
      }
    }
  },
  linux_mount_storage: {
    template: {
      what: 'Mount storage partitions, cloud volumes, or network file shares (NFS/CIFS) with persistent /etc/fstab entry.',
      why: 'Expands storage capacity, attaches shared volumes, and ensures mounts survive server reboots.',
      example: 'Mount /dev/sdb1 as ext4 on /mnt/data with defaults,noatime options and persistent fstab recording.'
    },
    parameters: {
      device: {
        what: 'Block device path, UUID, or network NFS export path.',
        why: 'Storage source partition or volume being attached.',
        example: '/dev/sdb1, UUID=e4d2..., 192.168.1.50:/volume1/share'
      },
      mount_point: {
        what: 'Target filesystem directory path.',
        why: 'Mount target folder where applications access disk contents.',
        example: '/mnt/storage, /var/data, /opt/backup'
      },
      fstype: {
        what: 'Filesystem type or network file protocol.',
        why: 'Kernel driver required to format and read/write the partition.',
        example: 'ext4, xfs, btrfs, nfs, cifs'
      },
      options: {
        what: 'Mount options flags passed to mount and /etc/fstab.',
        why: 'Controls caching, write barriers, read-only status, and boot failure tolerance.',
        example: 'defaults,noatime,nofail'
      },
      persist_fstab: {
        what: 'Record persistent configuration entry into /etc/fstab.',
        why: 'Guarantees the storage volume automatically remounts after reboot.',
        example: 'True (appends verified fstab line with backup)'
      }
    }
  },
  linux_firewall_rule: {
    template: {
      what: 'Manage firewall port rules adaptively across UFW, Firewalld, or Iptables on Linux servers.',
      why: 'Shields open server ports, blocks untrusted network traffic, and locks down sensitive endpoints.',
      example: 'Allow inbound port 443/tcp (HTTPS) globally, or allow port 22/tcp only from VPN subnet.'
    },
    parameters: {
      action: {
        what: 'Firewall action rule (allow, deny, delete).',
        why: 'Dictates packet handling for matching destination traffic.',
        example: 'allow, deny, delete'
      },
      port: {
        what: 'Destination port number or service protocol name.',
        why: 'Identifies the network service being protected.',
        example: '80 (HTTP), 443 (HTTPS), 22 (SSH), 3306 (MySQL)'
      },
      protocol: {
        what: 'Transport layer protocol (TCP or UDP).',
        why: 'Filters packets based on transport protocol.',
        example: 'tcp, udp'
      },
      source_cidr: {
        what: 'Source IPv4 or IPv6 CIDR subnet whitelist.',
        why: 'Restricts sensitive port access exclusively to approved corporate IPs or VPN gateways.',
        example: 'any (public), 192.168.1.0/24, 10.0.0.5/32'
      }
    }
  },
  linux_docker_container: {
    template: {
      what: 'Fleet-wide container operations, restart policies, resource pruning, and telemetry snapshots.',
      why: 'Maintains Docker microservice health and purges orphaned layers to reclaim disk space.',
      example: 'Restart critical service containers and execute docker system prune -af to reclaim gigabytes of storage.'
    },
    parameters: {
      action: {
        what: 'Docker action (restart_all, system_prune, inspect_running).',
        why: 'Directs Docker daemon orchestration across all fleet servers.',
        example: 'restart_all, system_prune, inspect_running'
      },
      container_name: {
        what: 'Target container name or matching pattern.',
        why: 'Scopes action to a specific workload without disturbing other services.',
        example: 'web_app, redis_cache, nginx_proxy, all'
      }
    }
  },
  linux_directory_lifecycle_backup: {
    template: {
      what: 'Fleet-wide directory lifecycle management: compressed archives with safe preservation, age-based purge, size cap, and rsync mirror.',
      why: 'Protects critical production data via non-overwriting backup archives while actively preventing disk exhaustion across all fleet hosts.',
      example: 'Daily compressed tar.gz backup of /var/log/app to /backup/archives preserving all prior snapshots.'
    },
    parameters: {
      action: {
        what: 'Lifecycle policy operational action: compress backup, age purge, size cap, or sync mirror.',
        why: 'Directs whether to archive, purge, enforce quota, or replicate.',
        example: 'backup, cleanup, size_cap, sync'
      },
      target_path: {
        what: 'Target absolute directory path on the remote Linux servers.',
        why: 'Defines the operational directory scope.',
        example: '/var/log/nginx, /opt/data, /var/backups'
      },
      schedule_mode: {
        what: 'Execution mode: run immediately once or register in persistent root crontab (daily, weekly, hourly).',
        why: 'Enables continuous hands-off automation across servers.',
        example: 'run_once, daily, weekly, hourly'
      },
      backup_format: {
        what: 'Compression algorithm and archive format (tar.gz, tar.bz2, tar.xz, zip).',
        why: 'Balances CPU consumption against disk space savings.',
        example: 'tar.gz (fast & standard), tar.xz (highest compression)'
      },
      backup_destination_path: {
        what: 'Directory folder on target hosts where backup archives are stored.',
        why: 'Separates live production files from archive snapshots.',
        example: '/backup/archives, /var/backups'
      },
      backup_keep_source_files: {
        what: 'If true, preserves source directory contents after archive generation.',
        why: 'Prevents disrupting active services reading from the source path.',
        example: 'Enabled (True)'
      },
      backup_preserve_all: {
        what: 'Safe Preservation Mode: All existing and previous backups remain intact; archives use unique collision-free timestamps.',
        why: 'Guarantees that historical snapshots are never lost when new backups run.',
        example: 'Enabled (Safe Preservation Mode)'
      },
      backup_max_count: {
        what: 'Max retained archives when Preserve All is disabled (auto-rotation threshold).',
        why: 'Prevents storage partition overflow when rotation is desired.',
        example: '7 (keep last 7 archives) or 14'
      },
      retention_days: {
        what: 'Retention age threshold in days for cleanup mode; older files are removed.',
        why: 'Frees disk space occupied by obsolete logs or stale files.',
        example: '30 days, 90 days'
      },
      file_pattern: {
        what: 'Filename matching glob pattern for deletion in cleanup mode.',
        why: 'Enables granular filtering of specific file extensions.',
        example: '*.log, *.tmp, *.audit'
      },
      size_cap_mb: {
        what: 'Maximum allowed directory storage ceiling in MB for size_cap action.',
        why: 'Caps runaway disk growth by automatically pruning oldest files.',
        example: '1024 (1 GB), 5120 (5 GB)'
      },
      sync_destination_path: {
        what: 'Destination path on target hosts for directory mirroring/sync.',
        why: 'Creates a live directory replica on another disk/partition.',
        example: '/backup/mirrors/app, /mnt/storage/mirror'
      },
      sync_delete_extraneous: {
        what: 'Removes files in destination that no longer exist in source path (--delete).',
        why: 'Maintains exact 100% parity with source.',
        example: 'Disabled (False) for extra safety'
      }
    }
  }
};

export function getServerTemplateGuide(
  templateId: string,
  isEn: boolean,
  backendTemplate?: any
): InfoItem {
  const guideMap = isEn ? SERVER_TEMPLATE_GUIDES_EN : SERVER_TEMPLATE_GUIDES_FA;
  const guide = guideMap[templateId]?.template;

  if (backendTemplate) {
    const what = isEn
      ? backendTemplate.info_what_en || guide?.what || backendTemplate.description_en || ''
      : backendTemplate.info_what_fa || guide?.what || backendTemplate.description || '';

    const why = isEn
      ? backendTemplate.info_why_en || guide?.why || (isEn ? 'Required for Linux fleet consistency and operational stability.' : 'ضروری جهت یکپارچگی ناوگان سرورهای لینوکس و پایداری عملیاتی.')
      : backendTemplate.info_why_fa || guide?.why || 'ضروری جهت یکپارچگی ناوگان سرورهای لینوکس و پایداری عملیاتی.';

    const example = isEn
      ? backendTemplate.info_example_en || guide?.example || ''
      : backendTemplate.info_example_fa || guide?.example || '';

    if (what || why || example) {
      return { what, why, example };
    }
  }

  if (guide) return guide;

  return {
    what: isEn ? 'Standard Linux fleet automation template.' : 'الگوی استاندارد اتوماسیون ناوگان سرورهای لینوکس.',
    why: isEn ? 'Ensures consistent multi-distribution execution across servers.' : 'ایجاد هماهنگی و یکپارچگی در پیکربندی سرورهای لینوکس.',
    example: isEn ? 'Batch execution across selected Linux servers.' : 'اجرای سراسری روی سرورهای انتخاب شده.'
  };
}

export function getServerParameterGuide(
  templateId: string,
  param: any,
  isEn: boolean
): InfoItem {
  const guideMap = isEn ? SERVER_TEMPLATE_GUIDES_EN : SERVER_TEMPLATE_GUIDES_FA;
  const tplGuide = guideMap[templateId];
  const paramGuide = tplGuide?.parameters?.[param.name];

  const what = isEn
    ? param.info_what_en || paramGuide?.what || (param.labelEn ? `${param.labelEn} parameter value.` : 'Configuration parameter.')
    : param.info_what_fa || paramGuide?.what || (param.labelFa ? `مقدار پارامتر ${param.labelFa}.` : 'پارامتر تنظیمی دستور.');

  const why = isEn
    ? param.info_why_en || paramGuide?.why || 'Controls execution behavior and arguments passed to the server shell.'
    : param.info_why_fa || paramGuide?.why || 'تعیین‌کننده رفتار اجرایی و مقادیر آرگومان‌های ارسالی به شل سرور.';

  const example = isEn
    ? param.info_example_en || paramGuide?.example || (param.placeholder ? `e.g. ${param.placeholder}` : (param.default !== undefined ? String(param.default) : ''))
    : param.info_example_fa || paramGuide?.example || (param.placeholder ? `نمونه: ${param.placeholder}` : (param.default !== undefined ? String(param.default) : ''));

  return { what, why, example };
}
